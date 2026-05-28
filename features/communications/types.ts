// ─────────────────────────────────────────────────────────────────────────
// Phase 21 — Communication types. Generic enough for future integrations
// (Twilio/Resend/Gmail/GHL) to write the same shape.
// ─────────────────────────────────────────────────────────────────────────

export type CommunicationChannel = 'call' | 'email' | 'sms' | 'meeting' | 'internal'
export type CommunicationDirection = 'inbound' | 'outbound' | 'internal'
export type CommunicationOutcome =
  | 'connected' | 'no_answer' | 'voicemail' | 'left_message'
  | 'sent' | 'received' | 'completed' | 'scheduled' | 'cancelled' | 'follow_up_needed'
  // Phase 23 — rich call outcomes (each drives operational behavior; see outcomes.ts)
  | 'interested' | 'not_interested' | 'booked_appointment' | 'wrong_number'
  | 'do_not_contact' | 'needs_docs' | 'call_back_later' | 'nurture'

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
  resolved_at: string | null
  resolved_by: string | null
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
  interested: 'Interested', not_interested: 'Not interested', booked_appointment: 'Booked appointment',
  wrong_number: 'Wrong number', do_not_contact: 'Do not contact', needs_docs: 'Needs docs',
  call_back_later: 'Call back later', nurture: 'Nurture',
}

export const OUTCOMES_BY_CHANNEL: Record<CommunicationChannel, CommunicationOutcome[]> = {
  call: [
    'connected', 'interested', 'booked_appointment', 'needs_docs', 'call_back_later',
    'no_answer', 'voicemail', 'left_message', 'not_interested', 'wrong_number',
    'do_not_contact', 'nurture', 'follow_up_needed',
  ],
  email: ['sent', 'received', 'interested', 'needs_docs', 'follow_up_needed'],
  sms: ['sent', 'received', 'interested', 'follow_up_needed'],
  meeting: ['completed', 'booked_appointment', 'scheduled', 'cancelled', 'follow_up_needed'],
  internal: [],
}
