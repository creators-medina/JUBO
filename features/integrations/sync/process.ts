// ─────────────────────────────────────────────────────────────────────────
// Shared inbound-sync processor. One code path for BOTH the webhook route
// (anon client, token-authed) and the in-app "simulate" action (user client).
// Everything writes through the token-gated SECURITY DEFINER RPCs.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { coerceValue } from '@/features/imports/validation/typeInference'
import type { FieldType } from '@/types/database'
import { providerDef } from '../providers'
import { routeBoardSlug, eventTitle, normalizedFieldInputs } from '../mapping/fieldMap'
import type { NormalizedEvent, ProcessResult } from '../types'

/** Stable, cheap hash for idempotency when no external event id is present. */
function hashPayload(payload: unknown): string {
  const s = JSON.stringify(payload ?? {})
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return `h${(h >>> 0).toString(16)}`
}

function recordTypeFor(ev: NormalizedEvent): string {
  switch (ev.entityType) {
    case 'loan': return 'loan'
    case 'borrower': return 'contact'
    case 'contact': return 'contact'
    default: return 'lead'
  }
}

/** Workflow event types this payload would emit (executed by a future worker). */
function workflowEventsFor(ev: NormalizedEvent, created: boolean): string[] {
  const evs = [created ? 'record.created' : 'record.updated', created ? 'integration.record_created' : 'integration.record_updated']
  if (ev.loan.status || ev.loan.milestone) evs.push('integration.loan_status_changed')
  return evs
}

type BoardContext = { board_id?: string; group_id?: string; error?: string; fields?: { id: string; slug: string; field_type: FieldType }[] }

export async function processIntegrationPayload(args: {
  supabase: SupabaseClient
  token: string
  providerHint?: string
  payload: unknown
}): Promise<ProcessResult> {
  const { supabase, token, payload } = args

  // 1. Authenticate by token → connection.
  const { data: resolved, error: resolveErr } = await supabase.rpc('integration_resolve', { p_token: token })
  if (resolveErr) return { ok: false, error: resolveErr.message }
  const conn = Array.isArray(resolved) ? resolved[0] : resolved
  if (!conn) return { ok: false, error: 'invalid_token' }
  if (conn.status !== 'active') return { ok: false, error: `connection_${conn.status}` }

  const provider = (conn.provider as string) ?? args.providerHint ?? 'custom_webhook'
  const def = providerDef(provider) ?? providerDef('custom_webhook')!

  // 2. Normalize.
  const ev = def.normalize(payload)
  const dedupeKey = ev.externalEventId || hashPayload(payload)

  try {
    // 3. Resolve the target board + its fields.
    const boardSlug = routeBoardSlug(ev)
    const { data: ctxData, error: ctxErr } = await supabase.rpc('integration_board_context', { p_token: token, p_board_slug: boardSlug })
    if (ctxErr) throw new Error(ctxErr.message)
    const ctx = (ctxData ?? {}) as BoardContext
    if (ctx.error || !ctx.board_id) {
      await supabase.rpc('integration_log_failure', {
        p_token: token, p_dedupe_key: dedupeKey, p_event_type: ev.eventType,
        p_payload: payload as object, p_error: 'No target board found (run onboarding to create starter boards).',
      })
      return { ok: false, error: 'no_board', eventId: undefined }
    }

    // 4. Map normalized values → board fields (coerced by field type).
    const fieldBySlug = new Map((ctx.fields ?? []).map((f) => [f.slug, f]))
    const fieldValues: Record<string, unknown>[] = []
    for (const { slug, raw } of normalizedFieldInputs(ev)) {
      const field = fieldBySlug.get(slug)
      if (!field) continue // unmapped — intentionally dropped (kept in raw payload)
      const patch = coerceValue(raw, field.field_type)
      if (patch) fieldValues.push({ field_id: field.id, ...patch })
    }

    // 5. Ingest (idempotent, matches/creates/updates + links + logs).
    const { data: result, error: ingestErr } = await supabase.rpc('integration_ingest', {
      p_token: token,
      p_external_event_id: ev.externalEventId ?? null,
      p_dedupe_key: dedupeKey,
      p_event_type: ev.eventType,
      p_entity_type: ev.entityType,
      p_external_id: ev.externalId ?? null,
      p_board_id: ctx.board_id,
      p_group_id: ctx.group_id ?? null,
      p_title: eventTitle(ev),
      p_record_type: recordTypeFor(ev),
      p_email: ev.person.email ?? null,
      p_phone: ev.person.phone ?? null,
      p_field_values: fieldValues,
      p_payload: payload as object,
      p_normalized: ev as unknown as object,
    })

    if (ingestErr) {
      await supabase.rpc('integration_log_failure', {
        p_token: token, p_dedupe_key: dedupeKey, p_event_type: ev.eventType,
        p_payload: payload as object, p_error: ingestErr.message,
      })
      return { ok: false, error: ingestErr.message }
    }

    const r = (result ?? {}) as { duplicate?: boolean; created?: boolean; record_id?: string; matched_on?: string | null; event_id?: string }
    if (r.duplicate) return { ok: true, duplicate: true }

    return {
      ok: true,
      duplicate: false,
      created: r.created,
      recordId: r.record_id,
      matchedOn: r.matched_on ?? null,
      eventId: r.event_id,
      workflowEvents: workflowEventsFor(ev, Boolean(r.created)),
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'processing_error'
    await supabase.rpc('integration_log_failure', {
      p_token: token, p_dedupe_key: dedupeKey, p_event_type: ev.eventType,
      p_payload: payload as object, p_error: msg,
    }).then(() => {}, () => {})
    return { ok: false, error: msg }
  }
}
