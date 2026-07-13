// ─────────────────────────────────────────────────────────────────────────
// Conversation queries. UI reads use the authed server client (RLS); webhook
// helpers (matchRecordByPhone / isPhoneOptedOut / getTwilioConfig) accept an
// injected client so the inbound webhook can pass the service-role admin client.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { normalizePhoneDigits, type ConversationMessage, type ConversationThread, type DeliveryStatus, type ThreadListItem, type TwilioConfig } from './types'

type AnyClient = SupabaseClient

export async function getConversationThreads(organizationId: string, limit = 100): Promise<ThreadListItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation_threads')
    .select('*, records:primary_record_id(title, board_id)')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false })
    .limit(limit)
  return ((data as unknown as Array<ConversationThread & { records: { title: string; board_id: string | null } | null }>) ?? []).map((t) => ({
    ...t,
    record_title: t.records?.title ?? null,
    record_board_id: t.records?.board_id ?? null,
  }))
}

export async function getThreadById(threadId: string): Promise<ThreadListItem | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation_threads')
    .select('*, records:primary_record_id(title, board_id)')
    .eq('id', threadId)
    .maybeSingle()
  if (!data) return null
  const t = data as unknown as ConversationThread & { records: { title: string; board_id: string | null } | null }
  return { ...t, record_title: t.records?.title ?? null, record_board_id: t.records?.board_id ?? null }
}

export async function getThreadMessages(threadId: string, limit = 200): Promise<ConversationMessage[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('communication_logs')
    .select('id, direction, body, occurred_at, metadata')
    .eq('thread_id', threadId)
    .order('occurred_at', { ascending: true })
    .limit(limit)
  return ((data as Array<{ id: string; direction: string; body: string | null; occurred_at: string; metadata: Record<string, unknown> }> | null) ?? []).map((m) => ({
    id: m.id,
    direction: m.direction === 'inbound' ? 'inbound' : 'outbound',
    body: m.body,
    occurred_at: m.occurred_at,
    deliveryStatus: ((m.metadata?.delivery_status as DeliveryStatus) ?? (m.direction === 'inbound' ? 'received' : 'sent')),
    errorMessage: (m.metadata?.error as string) ?? null,
  }))
}

/** Active thread for a record (workspace panel). */
export async function getThreadForRecord(recordId: string): Promise<ThreadListItem | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation_threads')
    .select('*, records:primary_record_id(title, board_id)')
    .eq('primary_record_id', recordId)
    .is('archived_at', null)
    .order('last_message_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const t = data as unknown as ConversationThread & { records: { title: string; board_id: string | null } | null }
  return { ...t, record_title: t.records?.title ?? null, record_board_id: t.records?.board_id ?? null }
}

/** Total unread across active threads (sidebar/Today badge). */
export async function getUnreadConversationCount(organizationId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation_threads')
    .select('unread_count')
    .eq('organization_id', organizationId)
    .is('archived_at', null)
    .gt('unread_count', 0)
  return ((data as { unread_count: number }[] | null) ?? []).reduce((n, t) => n + (t.unread_count ?? 0), 0)
}

// ── Webhook / send helpers (client injected so webhooks can use admin) ──────

/**
 * True when `phone` has opted out — matched by NORMALIZED last-10 digits, not
 * by exact string. Suppressions are stored as Twilio's E.164 `From`
 * (e.g. +12125551234) but a record's phone field may be `(212) 555-1234` or
 * `212-555-1234`; an exact match would let an opted-out contact be texted. We
 * compare the way the rest of the SMS layer already matches phones
 * (`findOrgByTwilioNumber` / `matchRecordByPhone`): normalize to digits, take
 * the last 10. opt_out_suppressions holds only opted-out numbers for the org,
 * so the org-scoped fetch is small.
 */
export async function isPhoneOptedOut(client: AnyClient, organizationId: string, phone: string): Promise<boolean> {
  const target = normalizePhoneDigits(phone).slice(-10)
  if (target.length < 7) return false
  const { data } = await client
    .from('opt_out_suppressions')
    .select('phone')
    .eq('organization_id', organizationId)
  for (const row of (data as { phone: string }[] | null) ?? []) {
    if (normalizePhoneDigits(row.phone).slice(-10) === target) return true
  }
  return false
}

export async function getTwilioConfig(client: AnyClient, organizationId: string): Promise<TwilioConfig | null> {
  const { data } = await client
    .from('integration_connections')
    .select('config, status')
    .eq('organization_id', organizationId)
    .eq('provider', 'twilio')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()
  if (!data) return null
  return ((data as { config: TwilioConfig }).config) ?? null
}

/** Find the org whose active Twilio connection owns the given inbound number. */
export async function findOrgByTwilioNumber(client: AnyClient, toNumber: string): Promise<{ organizationId: string; config: TwilioConfig } | null> {
  const tail = normalizePhoneDigits(toNumber).slice(-10)
  const { data } = await client
    .from('integration_connections')
    .select('organization_id, config')
    .eq('provider', 'twilio')
    .eq('status', 'active')
  for (const c of (data as Array<{ organization_id: string; config: TwilioConfig }> | null) ?? []) {
    const num = normalizePhoneDigits(c.config?.twilio_phone ?? '').slice(-10)
    if (num && num === tail) return { organizationId: c.organization_id, config: c.config }
  }
  return null
}

/**
 * Find the org whose active Twilio connection uses the given Messaging Service
 * SID. Fallback for inbound routing when an org configured ONLY a Messaging
 * Service (no `twilio_phone`) — otherwise `findOrgByTwilioNumber` can't match
 * the inbound `To` number and the message (including STOP) is silently dropped.
 */
export async function findOrgByMessagingServiceSid(client: AnyClient, messagingServiceSid: string | null | undefined): Promise<{ organizationId: string; config: TwilioConfig } | null> {
  const sid = (messagingServiceSid ?? '').trim()
  if (!sid) return null
  const { data } = await client
    .from('integration_connections')
    .select('organization_id, config')
    .eq('provider', 'twilio')
    .eq('status', 'active')
  for (const c of (data as Array<{ organization_id: string; config: TwilioConfig }> | null) ?? []) {
    if ((c.config?.messaging_service_sid ?? '') === sid) return { organizationId: c.organization_id, config: c.config }
  }
  return null
}

/** Match an inbound phone to a record via 'phone'-typed field values (org-wide). */
export async function matchRecordByPhone(client: AnyClient, organizationId: string, phone: string): Promise<{ recordId: string; name: string | null } | null> {
  const tail = normalizePhoneDigits(phone).slice(-10)
  if (tail.length < 7) return null
  const { data: fields } = await client
    .from('fields')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('field_type', 'phone')
  const fieldIds = ((fields as { id: string }[] | null) ?? []).map((f) => f.id)
  if (fieldIds.length === 0) return null

  const { data: vals } = await client
    .from('field_values')
    .select('record_id, value_text')
    .in('field_id', fieldIds)
    .not('value_text', 'is', null)
    .limit(2000)
  const match = ((vals as { record_id: string; value_text: string }[] | null) ?? [])
    .find((v) => normalizePhoneDigits(v.value_text).slice(-10) === tail)
  if (!match) return null

  const { data: rec } = await client.from('records').select('title').eq('id', match.record_id).maybeSingle()
  return { recordId: match.record_id, name: (rec as { title: string } | null)?.title ?? null }
}
