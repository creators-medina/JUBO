// ─────────────────────────────────────────────────────────────────────────
// Phase 26 — Conversation/SMS types. Threads group SMS by participant phone;
// messages are communication_logs rows (channel='sms') carrying a thread_id.
// ─────────────────────────────────────────────────────────────────────────

export type ThreadType = 'sms' | 'mixed' | 'internal'
export type MessageDirection = 'inbound' | 'outbound'
export type DeliveryStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'undelivered' | 'received'

export type ConversationThread = {
  id: string
  organization_id: string
  primary_record_id: string | null
  thread_type: ThreadType
  participant_phone: string
  participant_name: string | null
  last_message_at: string
  last_direction: MessageDirection
  last_preview: string | null
  unread_count: number
  archived_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

/** A thread row joined with its linked record's title for the list/detail UI. */
export type ThreadListItem = ConversationThread & {
  record_title: string | null
  record_board_id: string | null
}

/** One message in a thread (a communication_logs row, normalized for the UI). */
export type ConversationMessage = {
  id: string
  direction: MessageDirection
  body: string | null
  occurred_at: string
  deliveryStatus: DeliveryStatus
  errorMessage: string | null
}

/** Twilio connection config stored in integration_connections.config (server-side only). */
export type TwilioConfig = {
  account_sid: string
  auth_token: string
  messaging_service_sid?: string | null
  twilio_phone?: string | null
  inbound_enabled?: boolean
  outbound_enabled?: boolean
}

export const OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'] as const

/** Reduce a phone string to comparable digits (drops +, spaces, dashes, parens). */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  return (phone ?? '').replace(/\D/g, '')
}

/** True when an inbound body is an opt-out keyword (first word, case-insensitive). */
export function isOptOutMessage(body: string | null | undefined): { optOut: boolean; keyword: string | null } {
  const first = (body ?? '').trim().toUpperCase().split(/\s+/)[0] ?? ''
  const match = (OPT_OUT_KEYWORDS as readonly string[]).includes(first)
  return { optOut: match, keyword: match ? first : null }
}
