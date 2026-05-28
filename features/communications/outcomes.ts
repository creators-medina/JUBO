// ─────────────────────────────────────────────────────────────────────────
// Phase 23 — Rich outcome behavior. Each communication outcome maps to a small
// rule describing the operational follow-up it should drive. Pure config — no
// I/O — consumed by logCommunication (writes) and metrics (reads). Add a new
// outcome by adding a row here; the writer + metrics pick it up automatically.
// ─────────────────────────────────────────────────────────────────────────

import type { RecordPriority } from '@/types/database'
import type { CommunicationOutcome } from './types'

export type OutcomeBehavior = {
  /** A human was reached — drives connection-rate metrics. */
  connect: boolean
  /** Counts as a booked appointment in prospecting metrics. */
  booked?: boolean
  /** Set the record priority as a proxy for temperature (no stored temp field). */
  setPriority?: RecordPriority
  /** Set the record's next action + (optionally) a follow-up task, this many days out. */
  followUpInDays?: number
  /** Label for the next action / follow-up task. */
  nextActionLabel?: string
  /** Also create a follow-up task (not just the next-action pointer). */
  createTask?: boolean
}

// Default behavior for any outcome not explicitly listed (non-call channels mostly).
const NEUTRAL: OutcomeBehavior = { connect: false }

export const OUTCOME_BEHAVIOR: Record<CommunicationOutcome, OutcomeBehavior> = {
  // ── Calls — reached nobody ──
  no_answer:     { connect: false, followUpInDays: 1, nextActionLabel: 'Try again' },
  voicemail:     { connect: false, followUpInDays: 1, nextActionLabel: 'Try again' },
  left_message:  { connect: false, followUpInDays: 1, nextActionLabel: 'Try again' },
  wrong_number:  { connect: false, setPriority: 'low' },
  follow_up_needed: { connect: false, followUpInDays: 2, nextActionLabel: 'Follow up', createTask: true },

  // ── Calls — reached a human ──
  connected:         { connect: true },
  interested:        { connect: true, setPriority: 'high', followUpInDays: 2, nextActionLabel: 'Follow up — interested', createTask: true },
  booked_appointment:{ connect: true, booked: true, setPriority: 'high', followUpInDays: 1, nextActionLabel: 'Prepare for appointment', createTask: true },
  needs_docs:        { connect: true, followUpInDays: 2, nextActionLabel: 'Collect documents', createTask: true },
  call_back_later:   { connect: true, followUpInDays: 1, nextActionLabel: 'Call back' },
  not_interested:    { connect: true, setPriority: 'low', followUpInDays: 60, nextActionLabel: 'Nurture check-in' },
  do_not_contact:    { connect: true, setPriority: 'none' },
  nurture:           { connect: false, setPriority: 'low', followUpInDays: 30, nextActionLabel: 'Nurture touch' },

  // ── Non-call channels ──
  sent:      NEUTRAL,
  received:  { connect: true },
  completed: { connect: true },
  scheduled: { connect: false, booked: true },
  cancelled: NEUTRAL,
}

/** Outcomes that mean a human was reached (for connection-rate math). */
export const CONNECT_OUTCOMES: Set<string> = new Set(
  (Object.keys(OUTCOME_BEHAVIOR) as CommunicationOutcome[]).filter((o) => OUTCOME_BEHAVIOR[o].connect),
)

/** Outcomes that count as a booked appointment. */
export const BOOKED_OUTCOMES: Set<string> = new Set(
  (Object.keys(OUTCOME_BEHAVIOR) as CommunicationOutcome[]).filter((o) => OUTCOME_BEHAVIOR[o].booked),
)

export function isConnect(outcome: string | null | undefined): boolean {
  return !!outcome && CONNECT_OUTCOMES.has(outcome)
}

export function isBookedAppointment(channel: string, outcome: string | null | undefined): boolean {
  return channel === 'meeting' || (!!outcome && BOOKED_OUTCOMES.has(outcome))
}

export function behaviorFor(outcome: CommunicationOutcome | null | undefined): OutcomeBehavior {
  return outcome ? OUTCOME_BEHAVIOR[outcome] ?? NEUTRAL : NEUTRAL
}
