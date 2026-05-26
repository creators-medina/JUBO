'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { captureIntegrationEvent } from './sync/process'
import { runIntegrationWorker, requeueEvent, type WorkerSummary } from './runtime/worker'
import { runScheduledJobs } from './runtime/scheduler'
import type { SystemExecutionContext } from './runtime/context'
import type { ConnectionStatus, ProcessResult, ProviderId } from './types'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

function newToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
}

/** Create an integration connection. Returns id + secret token (shown to admin). */
export async function createConnection(input: {
  organizationId: string
  provider: ProviderId
  displayName: string
}): Promise<{ id: string; secret_token: string }> {
  const { supabase, user } = await requireUser()
  const { data, error } = await supabase
    .from('integration_connections')
    .insert({
      organization_id: input.organizationId,
      provider: input.provider,
      display_name: input.displayName,
      created_by: user.id,
    })
    .select('id, secret_token')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create connection')
  revalidatePath('/settings/integrations')
  return { id: data.id, secret_token: data.secret_token }
}

export async function setConnectionStatus(connectionId: string, status: ConnectionStatus): Promise<void> {
  const { supabase } = await requireUser()
  const { error } = await supabase.from('integration_connections').update({ status }).eq('id', connectionId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/integrations')
}

export async function rotateToken(connectionId: string): Promise<string> {
  const { supabase } = await requireUser()
  const token = newToken()
  const { error } = await supabase.from('integration_connections').update({ secret_token: token }).eq('id', connectionId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/integrations')
  return token
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const { supabase } = await requireUser()
  const { error } = await supabase.from('integration_connections').delete().eq('id', connectionId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/integrations')
}

async function ctxFor(organizationId: string): Promise<SystemExecutionContext> {
  const { user } = await requireUser()
  return { organizationId, userId: user.id, actorType: 'user', source: 'manual' }
}

/** Run the async worker + scheduler now (manual / Today drain). */
export async function runWorkerAction(organizationId: string): Promise<WorkerSummary> {
  const { supabase } = await requireUser()
  const ctx = await ctxFor(organizationId)
  const client = supabase as unknown as SupabaseClient
  const summary = await runIntegrationWorker(client, ctx, { limit: 50 })
  await runScheduledJobs(client, ctx)
  revalidatePath('/settings/integrations')
  revalidatePath('/today')
  return summary
}

/**
 * Simulate a webhook from inside the app: capture a pending event, then drain
 * it immediately so the user sees the result. Returns the resulting event state.
 */
export async function simulateEvent(connectionId: string, payloadText: string): Promise<ProcessResult> {
  const { supabase } = await requireUser()
  const { data: conn } = await supabase
    .from('integration_connections')
    .select('secret_token, provider, organization_id')
    .eq('id', connectionId)
    .single()
  if (!conn) return { ok: false, error: 'connection_not_found' }

  let payload: unknown
  try { payload = JSON.parse(payloadText) } catch { return { ok: false, error: 'invalid_json' } }

  const client = supabase as unknown as SupabaseClient
  const capture = await captureIntegrationEvent({ supabase: client, token: conn.secret_token, providerHint: conn.provider, payload })
  if (!capture.ok) return { ok: false, error: capture.error }
  if (capture.duplicate) return { ok: true, duplicate: true }

  const ctx = await ctxFor(conn.organization_id)
  await runIntegrationWorker(client, ctx, { limit: 5 })

  // Report what happened to this event.
  const { data: ev } = await supabase
    .from('integration_events')
    .select('status, record_id, error_message')
    .eq('id', capture.eventId!)
    .maybeSingle()
  revalidatePath('/settings/integrations')
  revalidatePath('/today')
  if (ev?.status === 'processed') return { ok: true, recordId: ev.record_id ?? undefined, eventId: capture.eventId }
  if (ev?.status === 'failed') return { ok: false, error: ev.error_message ?? 'processing_failed', eventId: capture.eventId }
  return { ok: true, eventId: capture.eventId }
}

/** Requeue an event (retry/replay/reprocess) and drain immediately. */
export async function retryEvent(eventId: string): Promise<WorkerSummary | { ok: false; error: string }> {
  const { supabase } = await requireUser()
  const { data: ev } = await supabase
    .from('integration_events')
    .select('organization_id')
    .eq('id', eventId)
    .single()
  if (!ev) return { ok: false, error: 'event_not_found' }

  const client = supabase as unknown as SupabaseClient
  await requeueEvent(client, eventId)
  const ctx = await ctxFor(ev.organization_id)
  const summary = await runIntegrationWorker(client, ctx, { limit: 50 })
  revalidatePath('/settings/integrations')
  revalidatePath('/today')
  return summary
}

export const replayEvent = retryEvent

/** Mark an event ignored — it won't be processed by the worker. */
export async function setEventIgnored(eventId: string): Promise<void> {
  const { supabase } = await requireUser()
  await supabase.from('integration_events').update({ status: 'ignored' }).eq('id', eventId)
  revalidatePath('/settings/integrations')
}

// ── Stage mapping management ──────────────────────────────────────────────────
export async function seedStageMappings(organizationId: string): Promise<void> {
  const { supabase } = await requireUser()
  const { defaultSeedRows } = await import('./runtime/stageMapping')
  await supabase
    .from('integration_stage_mappings')
    .upsert(defaultSeedRows(organizationId), { onConflict: 'organization_id,keyword' })
  revalidatePath('/settings/integrations/stage-mapping')
}

export async function upsertStageMapping(input: {
  organizationId: string
  id?: string
  keyword: string
  board_slug: string
  group_name: string
  stage_order: number
  enabled: boolean
}): Promise<void> {
  const { supabase } = await requireUser()
  const row = {
    organization_id: input.organizationId, keyword: input.keyword.trim().toLowerCase(),
    board_slug: input.board_slug, group_name: input.group_name, stage_order: input.stage_order, enabled: input.enabled,
  }
  await supabase.from('integration_stage_mappings').upsert(row, { onConflict: 'organization_id,keyword' })
  revalidatePath('/settings/integrations/stage-mapping')
}

export async function setStageMappingEnabled(id: string, enabled: boolean): Promise<void> {
  const { supabase } = await requireUser()
  await supabase.from('integration_stage_mappings').update({ enabled }).eq('id', id)
  revalidatePath('/settings/integrations/stage-mapping')
}

export async function deleteStageMapping(id: string): Promise<void> {
  const { supabase } = await requireUser()
  await supabase.from('integration_stage_mappings').delete().eq('id', id)
  revalidatePath('/settings/integrations/stage-mapping')
}
