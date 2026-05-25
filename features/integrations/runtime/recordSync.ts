// ─────────────────────────────────────────────────────────────────────────
// Record sync — match → create/update a record + field values + external link,
// in the authenticated worker context (member RLS; no privileged RPC needed).
// Mirrors the Phase 17 ingest matching, but for already-captured pending events.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { coerceValue } from '@/features/imports/validation/typeInference'
import type { FieldType, RecordType } from '@/types/database'
import { routeBoardSlug, eventTitle, normalizedFieldInputs } from '../mapping/fieldMap'
import type { SystemExecutionContext } from './context'
import type { NormalizedEvent } from '../types'

function digits(v: string): string { return `${v ?? ''}`.replace(/\D/g, '') }

function recordTypeFor(ev: NormalizedEvent): RecordType {
  switch (ev.entityType) {
    case 'loan': return 'loan'
    case 'borrower':
    case 'contact': return 'contact'
    default: return 'lead'
  }
}

export type RecordSyncResult = {
  recordId: string
  created: boolean
  boardId: string
  groupId: string | null
  matchedOn: string | null
}

export async function syncRecordFromEvent(
  supabase: SupabaseClient,
  ctx: SystemExecutionContext,
  ev: NormalizedEvent,
  provider: string,
): Promise<RecordSyncResult> {
  // 1. Resolve the entry board for this entity type.
  const boardSlug = routeBoardSlug(ev)
  let { data: board } = await supabase
    .from('boards').select('id').eq('organization_id', ctx.organizationId).eq('slug', boardSlug).eq('is_archived', false).maybeSingle()
  if (!board) {
    const { data: any } = await supabase
      .from('boards').select('id').eq('organization_id', ctx.organizationId).eq('is_archived', false).order('created_at').limit(1).maybeSingle()
    board = any
  }
  if (!board) throw new Error('no_target_board')

  const [{ data: fields }, { data: firstGroup }] = await Promise.all([
    supabase.from('fields').select('id, slug, field_type').eq('board_id', board.id),
    supabase.from('board_groups').select('id').eq('board_id', board.id).eq('is_archived', false).order('position').limit(1).maybeSingle(),
  ])
  const fieldBySlug = new Map((fields ?? []).map((f) => [f.slug, f as { id: string; slug: string; field_type: FieldType }]))
  const emailFieldId = (fields ?? []).find((f) => f.field_type === 'email')?.id
  const phoneFieldId = (fields ?? []).find((f) => f.field_type === 'phone')?.id

  // 2. Match: external link → email → phone → exact title.
  let recordId: string | null = null
  let matchedOn: string | null = null

  if (ev.externalId) {
    const { data } = await supabase
      .from('external_record_links').select('record_id')
      .eq('organization_id', ctx.organizationId).eq('provider', provider).eq('external_id', ev.externalId).maybeSingle()
    if (data) { recordId = data.record_id; matchedOn = 'external_id' }
  }
  if (!recordId && ev.person.email && emailFieldId) {
    const { data } = await supabase
      .from('field_values').select('record_id, records!inner(is_archived)')
      .eq('field_id', emailFieldId).ilike('value_text', ev.person.email).limit(1)
    const hit = (data ?? [])[0] as { record_id: string } | undefined
    if (hit) { recordId = hit.record_id; matchedOn = 'email' }
  }
  if (!recordId && ev.person.phone && phoneFieldId) {
    const want = digits(ev.person.phone)
    if (want.length >= 7) {
      const { data } = await supabase.from('field_values').select('record_id, value_text').eq('field_id', phoneFieldId)
      const hit = (data ?? []).find((r) => digits(r.value_text ?? '') === want)
      if (hit) { recordId = hit.record_id; matchedOn = 'phone' }
    }
  }
  const title = eventTitle(ev)
  if (!recordId) {
    const { data } = await supabase
      .from('records').select('id').eq('board_id', board.id).eq('is_archived', false).ilike('title', title).limit(1)
    const hit = (data ?? [])[0] as { id: string } | undefined
    if (hit) { recordId = hit.id; matchedOn = 'name' }
  }

  // 3. Create or update.
  let created = false
  let groupId: string | null = firstGroup?.id ?? null
  if (!recordId) {
    const { data: rec, error } = await supabase
      .from('records')
      .insert({
        organization_id: ctx.organizationId, board_id: board.id, group_id: groupId,
        title: title || 'Synced contact', record_type: recordTypeFor(ev),
        owner_user_id: ctx.userId, created_by: ctx.userId,
      })
      .select('id, group_id').single()
    if (error || !rec) throw new Error(error?.message ?? 'record_insert_failed')
    recordId = rec.id
    created = true
    groupId = rec.group_id
    if (ev.externalId) {
      await supabase.from('external_record_links').upsert(
        { organization_id: ctx.organizationId, provider, external_id: ev.externalId, record_id: recordId, entity_type: ev.entityType },
        { onConflict: 'organization_id,provider,external_id' },
      )
    }
  } else {
    const { data: existing } = await supabase.from('records').select('group_id, board_id').eq('id', recordId).maybeSingle()
    groupId = existing?.group_id ?? groupId
    if (title) await supabase.from('records').update({ title, updated_at: new Date().toISOString() }).eq('id', recordId)
    if (ev.externalId) {
      await supabase.from('external_record_links').upsert(
        { organization_id: ctx.organizationId, provider, external_id: ev.externalId, record_id: recordId, entity_type: ev.entityType },
        { onConflict: 'organization_id,provider,external_id' },
      )
    }
  }

  // 4. Field values (coerced by field type, upserted).
  const fvInserts: Record<string, unknown>[] = []
  for (const { slug, raw } of normalizedFieldInputs(ev)) {
    const field = fieldBySlug.get(slug)
    if (!field) continue
    const patch = coerceValue(raw, field.field_type)
    if (patch) fvInserts.push({ field_id: field.id, record_id: recordId, ...patch })
  }
  if (fvInserts.length > 0) {
    await supabase.from('field_values').upsert(fvInserts, { onConflict: 'field_id,record_id' })
  }

  return { recordId: recordId as string, created, boardId: board.id, groupId, matchedOn }
}
