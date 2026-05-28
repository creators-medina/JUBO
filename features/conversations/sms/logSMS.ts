// ─────────────────────────────────────────────────────────────────────────
// Shared SMS recorder — the single write path for both outbound sends and
// inbound webhooks. Works with any Supabase client (authed server client or the
// service-role admin client used by webhooks). Idempotent on Twilio MessageSid.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { MessageDirection } from '../types'

type AnyClient = SupabaseClient

export type RecordSmsInput = {
  organizationId: string
  recordId: string | null
  participantPhone: string
  participantName?: string | null
  direction: MessageDirection
  body: string
  userId: string | null
  twilioMessageSid?: string | null
  deliveryStatus?: string
  occurredAt?: string
}

export type RecordSmsResult = {
  threadId: string
  logId: string | null
  duplicate: boolean
  threadCreated: boolean
  unreadCount: number
}

/** Find-or-create the thread, write the message log, update the thread + timeline. */
export async function recordSmsMessage(client: AnyClient, input: RecordSmsInput): Promise<RecordSmsResult> {
  const occurredAt = input.occurredAt ?? new Date().toISOString()
  const preview = (input.body ?? '').slice(0, 120)

  // Idempotency: a replayed webhook (same MessageSid) must not double-write.
  if (input.twilioMessageSid) {
    const { data: existing } = await client
      .from('communication_logs')
      .select('id, thread_id')
      .eq('organization_id', input.organizationId)
      .eq('metadata->>twilio_message_sid', input.twilioMessageSid)
      .limit(1)
      .maybeSingle()
    if (existing) {
      return { threadId: (existing as { thread_id: string }).thread_id, logId: (existing as { id: string }).id, duplicate: true, threadCreated: false, unreadCount: 0 }
    }
  }

  // Find or create the active thread for this org + phone.
  const { data: found } = await client
    .from('conversation_threads')
    .select('id, primary_record_id, unread_count')
    .eq('organization_id', input.organizationId)
    .eq('participant_phone', input.participantPhone)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle()

  let threadId: string
  let threadCreated = false
  let unreadCount = 0

  if (found) {
    threadId = (found as { id: string }).id
    const cur = (found as { unread_count: number }).unread_count ?? 0
    unreadCount = input.direction === 'inbound' ? cur + 1 : cur
    const patch: Record<string, unknown> = {
      last_message_at: occurredAt,
      last_direction: input.direction,
      last_preview: preview,
      unread_count: unreadCount,
    }
    // Link a record if the thread didn't have one yet.
    if (!(found as { primary_record_id: string | null }).primary_record_id && input.recordId) {
      patch.primary_record_id = input.recordId
    }
    await client.from('conversation_threads').update(patch).eq('id', threadId)
  } else {
    unreadCount = input.direction === 'inbound' ? 1 : 0
    const { data: created, error } = await client
      .from('conversation_threads')
      .insert({
        organization_id: input.organizationId,
        primary_record_id: input.recordId,
        thread_type: 'sms',
        participant_phone: input.participantPhone,
        participant_name: input.participantName ?? null,
        last_message_at: occurredAt,
        last_direction: input.direction,
        last_preview: preview,
        unread_count: unreadCount,
      })
      .select('id')
      .single()
    if (error || !created) throw new Error(error?.message ?? 'thread_create_failed')
    threadId = (created as { id: string }).id
    threadCreated = true
  }

  // Write the message as a communication_log (unified communication layer).
  const { data: log } = await client
    .from('communication_logs')
    .insert({
      organization_id: input.organizationId,
      record_id: input.recordId,
      created_by: input.userId,
      channel: 'sms',
      direction: input.direction,
      outcome: input.direction === 'inbound' ? 'received' : 'sent',
      body: input.body,
      occurred_at: occurredAt,
      thread_id: threadId,
      metadata: {
        twilio_message_sid: input.twilioMessageSid ?? null,
        delivery_status: input.deliveryStatus ?? (input.direction === 'inbound' ? 'received' : 'sent'),
        participant_phone: input.participantPhone,
      },
    })
    .select('id')
    .maybeSingle()

  // Unified timeline activity (only when linked to a record — activities are record-scoped).
  if (input.recordId) {
    await client.from('activities').insert({
      organization_id: input.organizationId,
      record_id: input.recordId,
      user_id: input.userId,
      activity_type: 'sms',
      content: `${input.direction === 'inbound' ? 'Received' : 'Sent'} SMS${preview ? ` — "${preview}"` : ''}`,
      metadata: { communication_log_id: (log as { id: string } | null)?.id ?? null, channel: 'sms', direction: input.direction, thread_id: threadId },
    })
  }

  return { threadId, logId: (log as { id: string } | null)?.id ?? null, duplicate: false, threadCreated, unreadCount }
}
