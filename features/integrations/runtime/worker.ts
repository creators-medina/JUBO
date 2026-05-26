// ─────────────────────────────────────────────────────────────────────────
// Async integration worker.
//
// Drains `pending`/`retrying` integration_events in an authenticated member
// session: record sync → pipeline movement → workflow dispatch → finalize.
// Idempotent (events are claimed optimistically; record matching dedupes;
// movement is a no-op when already in place). Retries with attempt limits.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import type { SystemExecutionContext } from './context'
import { syncRecordFromEvent } from './recordSync'
import { applyPipelineMovement } from './movement'
import type { NormalizedEvent } from '../types'

const MAX_ATTEMPTS = 4
const DEFAULT_LIMIT = 25

export type WorkerSummary = { picked: number; processed: number; created: number; moved: number; failed: number }

export async function runIntegrationWorker(
  supabase: SupabaseClient,
  ctx: SystemExecutionContext,
  opts: { limit?: number } = {},
): Promise<WorkerSummary> {
  const limit = opts.limit ?? DEFAULT_LIMIT
  const summary: WorkerSummary = { picked: 0, processed: 0, created: 0, moved: 0, failed: 0 }

  const { data: events } = await supabase
    .from('integration_events')
    .select('id, provider, normalized, status, attempt_count')
    .eq('organization_id', ctx.organizationId)
    .in('status', ['pending', 'retrying'])
    .order('created_at', { ascending: true })
    .limit(limit)

  if (!events || events.length === 0) return summary

  for (const ev of events) {
    // Optimistic claim — only proceed if we flip the row from its current status.
    const { data: claimed } = await supabase
      .from('integration_events')
      .update({ status: 'processing', attempt_count: (ev.attempt_count ?? 0) + 1, last_attempt_at: new Date().toISOString() })
      .eq('id', ev.id)
      .eq('status', ev.status)
      .select('id')
    if (!claimed || claimed.length === 0) continue // another worker took it
    summary.picked++

    const started = Date.now()
    try {
      const normalized = ev.normalized as unknown as NormalizedEvent
      if (!normalized || (!normalized.person && !normalized.loan)) throw new Error('empty_normalized_payload')

      const sync = await syncRecordFromEvent(supabase, ctx, normalized, ev.provider)

      // New record → record.created; existing material change → record.updated.
      if (sync.created) {
        await dispatchWorkflowEvent(
          { type: 'record.created', organizationId: ctx.organizationId, recordId: sync.recordId },
          { client: supabase, userId: ctx.userId },
        )
        summary.created++
      } else if (sync.changedFields.length > 0) {
        await dispatchWorkflowEvent(
          { type: 'record.updated', organizationId: ctx.organizationId, recordId: sync.recordId, changedFields: sync.changedFields },
          { client: supabase, userId: ctx.userId },
        )
      }

      // Milestone/status → pipeline movement (fires record.group_changed workflows).
      const mv = await applyPipelineMovement(
        supabase, ctx, sync.recordId,
        { board_id: sync.boardId, group_id: sync.groupId }, normalized,
      )
      if (mv.moved) summary.moved++

      await supabase
        .from('integration_events')
        .update({
          status: 'processed', record_id: sync.recordId, processed_at: new Date().toISOString(),
          processing_duration_ms: Date.now() - started, error_message: null,
        })
        .eq('id', ev.id)
      summary.processed++
    } catch (e) {
      const attempts = (ev.attempt_count ?? 0) + 1
      const status = attempts >= MAX_ATTEMPTS ? 'failed' : 'retrying'
      await supabase
        .from('integration_events')
        .update({
          status, error_message: e instanceof Error ? e.message : 'processing_error',
          processing_duration_ms: Date.now() - started,
        })
        .eq('id', ev.id)
      summary.failed++
    }
  }

  return summary
}

/** Reset an event so the worker will pick it up again (retry/replay). */
export async function requeueEvent(supabase: SupabaseClient, eventId: string): Promise<void> {
  await supabase.from('integration_events').update({ status: 'pending', error_message: null }).eq('id', eventId)
}
