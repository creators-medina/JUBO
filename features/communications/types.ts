// ─────────────────────────────────────────────────────────────────────────
// Phase 21 — Communication types. Generic enough for future integrations
// (Twilio/Resend/Gmail/GHL) to write the same shape.
// ─────────────────────────────────────────────────────────────────────────

export type CommunicationChannel = 'call' | 'email' | 'sms' | 'meeting' | 'internal'
export type CommunicationDirection = 'inbound' | 'outbound' | 'internal'
export type CommunicationOutcome =
  | 'connected' | 'no_answer' | 'voicemail' | 'left_message'
  | 'sent' | 'received' | 'completed' | 'scheduled' | 'cancelled' | 'follow_up_needed'

export type CommunicationLog = {
  id: string
  organization_id: string
  record_id: string
  created_by: string | null
  channel: CommunicationChannel
  direction: CommunicationDirection
  outcome: CommunicationOutcome | null
  subject: string | null
  summary: string | null
  body: string | null
  occurred_at: string
  follow_up_at: string | null
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type ContactHealth = 'healthy' | 'warming' | 'stale' | 'unknown'

// Default direction per channel for fast logging.
export const DEFAULT_DIRECTION: Record<CommunicationChannel, CommunicationDirection> = {
  call: 'outbound',
  email: 'outbound',
  sms: 'outbound',
  meeting: 'outbound',
  internal: 'internal',
}

// Default outcome per channel.
export const DEFAULT_OUTCOME: Record<CommunicationChannel, CommunicationOutcome | null> = {
  call: 'connected',
  email: 'sent',
  sms: 'sent',
  meeting: 'completed',
  internal: null,
}

export const CHANNEL_LABEL: Record<CommunicationChannel, string> = {
  call: 'Call', email: 'Email', sms: 'SMS', meeting: 'Meeting', internal: 'Internal note',
}

export const OUTCOME_LABEL: Record<CommunicationOutcome, string> = {
  connected: 'Connected', no_answer: 'No answer', voicemail: 'Voicemail', left_message: 'Left message',
  sent: 'Sent', received: 'Received', completed: 'Completed', scheduled: 'Scheduled',
  cancelled: 'Cancelled', follow_up_needed: 'Follow-up needed',
}

export const OUTCOMES_BY_CHANNEL: Record<CommunicationChannel, CommunicationOutcome[]> = {
  call: ['connected', 'no_answer', 'voicemail', 'left_message', 'follow_up_needed'],
  email: ['sent', 'received', 'follow_up_needed'],
  sms: ['sent', 'received', 'follow_up_needed'],
  meeting: ['completed', 'scheduled', 'cancelled', 'follow_up_needed'],
  internal: [],
}
