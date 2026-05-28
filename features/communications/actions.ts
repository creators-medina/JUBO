'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import {
  DEFAULT_DIRECTION, DEFAULT_OUTCOME, CHANNEL_LABEL, OUTCOME_LABEL,
  type CommunicationChannel, type CommunicationDirection, type CommunicationOutcome,
} from './types'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

function isoInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

export type LogCommunicationInput = {
  recordId: string
  channel: CommunicationChannel
  direction?: CommunicationDirection
  outcome?: CommunicationOutcome | null
  subject?: string | null
  summary?: string | null
  body?: string | null
  occurredAt?: string | null
  followUpAt?: string | null
  createFollowUpTask?: boolean
  setNextAction?: boolean
  nextActionLabel?: string | null
}

/**
 * Log a communication. Derives the org from the record (verifying access via
 * RLS), writes the structured log + a timeline activity, optionally creates a
 * follow-up task / sets the next action, and dispatches communication.logged.
 */
export async function logCommunication(input: LogCommunicationInput): Promise<{ id: string } | { error: string }> {
  const { supabase, user } = await requireUser()

  const { data: record } = await supabase
    .from('records').select('id, organization_id, board_id').eq('id', input.recordId).maybeSingle()
  if (!record) return { error: 'record_not_found' }

  const channel = input.channel
  const direction = input.direction ?? DEFAULT_DIRECTION[channel]
  const outcome = input.outcome === undefined ? DEFAULT_OUTCOME[channel] : input.outcome
  const occurredAt = input.occurredAt ?? new Date().toISOString()

  // 1. Structured communication log.
  const { data: log, error } = await supabase
    .from('communication_logs')
    .insert({
      organization_id: record.organization_id, record_id: record.id, created_by: user.id,
      channel, direction, outcome, subject: input.subject ?? null,
      summary: input.summary ?? null, body: input.body ?? null,
      occurred_at: occurredAt, follow_up_at: input.followUpAt ?? null,
    })
    .select('id')
    .single()
  if (error || !log) return { error: error?.message ?? 'log_failed' }

  // 2. Timeline activity (reuses the unified timeline; channel maps to an icon).
  const activityType = channel === 'internal' ? 'note' : channel
  const content = `Logged ${direction} ${CHANNEL_LABEL[channel].toLowerCase()}${outcome ? ` — ${OUTCOME_LABEL[outcome]}` : ''}`
  await supabase.from('activities').insert({
    organization_id: record.organization_id, record_id: record.id, user_id: user.id,
    activity_type: activityType, content,
    metadata: { communication_log_id: log.id, channel, direction, outcome, follow_up_at: input.followUpAt ?? null },
  })

  // 3. Follow-up bridge: next action + task.
  if (input.setNextAction) {
    const label = input.nextActionLabel ?? 'Follow up'
    const dueAt = input.followUpAt ?? isoInDays(2)
    await supabase.rpc('set_next_action', { p_record_id: record.id, p_next_action: label, p_due_at: dueAt, p_user_id: user.id })
  }
  if (input.createFollowUpTask && input.followUpAt) {
    const title = input.nextActionLabel ?? `Follow up (${CHANNEL_LABEL[channel]})`
    const { data: existing } = await supabase
      .from('tasks').select('id').eq('record_id', record.id).eq('title', title).is('completed_at', null).limit(1)
    if (!existing || existing.length === 0) {
      await supabase.from('tasks').insert({
        organization_id: record.organization_id, record_id: record.id, title,
        due_date: input.followUpAt, priority: 'medium', created_by: user.id, assigned_user_id: user.id,
      })
    }
  }

  // 4. Workflow event (best-effort; engine is idempotent).
  await dispatchWorkflowEvent(
    {
      type: 'communication.logged', organizationId: record.organization_id, recordId: record.id,
      commChannel: channel, commDirection: direction, commOutcome: outcome ?? undefined, commFollowUpAt: input.followUpAt ?? null,
    },
    { client: supabase as unknown as SupabaseClient, userId: user.id },
  )

  revalidatePath('/today')
  if (record.board_id) revalidatePath(`/boards/${record.board_id}`)
  return { id: log.id }
}

/** Fast call-outcome logging — minimal clicks, sensible follow-up defaults. */
export async function quickCallOutcome(recordId: string, outcome: CommunicationOutcome): Promise<{ id: string } | { error: string }> {
  const followUp = outcome === 'follow_up_needed'
  const suggestNext = outcome === 'no_answer' || outcome === 'voicemail' || outcome === 'left_message' || outcome === 'follow_up_needed'
  const label =
    outcome === 'follow_up_needed' ? 'Follow up' :
    outcome === 'connected' ? null :
    'Try again'
  return logCommunication({
    recordId, channel: 'call', direction: 'outbound', outcome,
    summary: `Quick-logged: ${OUTCOME_LABEL[outcome]}`,
    followUpAt: followUp ? isoInDays(2) : suggestNext ? isoInDays(1) : null,
    setNextAction: suggestNext,
    nextActionLabel: label,
  })
}
