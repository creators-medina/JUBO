// ─────────────────────────────────────────────────────────────────────────
// Phase 22 — Prospecting cockpit types. The daily execution layer on top of
// records + communication_logs. No AI — pure heuristic scoring.
// ─────────────────────────────────────────────────────────────────────────

export type LeadTemperature = 'hot' | 'warm' | 'cold' | 'dormant'

export type QueueBucketKey = 'overdue_followups' | 'hot' | 'expiring' | 'stale' | 'partners' | 'fresh'

/** Signals assembled per candidate record (all from existing data). */
export type CandidateSignal = {
  recordId: string
  title: string
  boardId: string | null
  boardSlug: string | null
  recordType: string | null
  groupName: string | null
  value: number | null
  priority: string
  nextAction: string | null
  nextActionDueAt: string | null
  nextActionCompletedAt: string | null
  updatedAt: string
  lastContactedAt: string | null
  daysSinceContact: number | null
  preapprovalExpDays: number | null
  loanAmount: number | null
  phone: string | null
}

export type ScoredLead = {
  recordId: string
  title: string
  boardId: string | null
  boardSlug: string | null
  groupName: string | null
  temperature: LeadTemperature
  score: number
  reasons: string[]
  bucket: QueueBucketKey
  loanAmount: number | null
  daysSinceContact: number | null
  nextActionDueAt: string | null
  phone: string | null
}

export type ProspectingMetrics = {
  callsToday: number
  connectsToday: number
  voicemailToday: number
  noAnswerToday: number
  connectionRate: number       // 0..1 (today)
  meetingsBookedToday: number
  followUpsCreatedToday: number
  callsThisWeek: number
  connectsThisWeek: number
  connectionRateWeek: number   // 0..1 (this week)
  bookedThisWeek: number
  activeDaysThisWeek: number
  bestDayCalls: number         // most calls in a single day this week
  bestDayLabel: string | null  // e.g. "Tue" — the best day this week
  avgCallsPerActiveDay: number
  callsThisMonth: number       // calendar month-to-date (Phase 34B momentum)
  callsThisYear: number        // calendar year-to-date (Phase 34B momentum)
}

/** Where a call target came from (mirrors target/index.ts CallTargetSource). */
export type CallTargetSource = 'session' | 'profile' | 'goal' | 'default'

/**
 * Daily/weekly/monthly/yearly call targets for the momentum section. Period
 * targets come from goal_targets when present, else scale off the daily target.
 * Defined here (no server imports) so client components can import the type.
 */
export type PeriodCallTargets = {
  daily: number
  weekly: number
  monthly: number
  yearly: number
  source: CallTargetSource
  label: string
}

/** Prospecting streak — consecutive calendar days with at least one call. */
export type ProspectingStreak = {
  current: number       // consecutive days, counting back from today/yesterday
  todayLogged: boolean  // whether today already has a logged call
}

export type SessionRow = {
  id: string
  organization_id: string
  user_id: string
  started_at: string
  ended_at: string | null
  target_calls: number
  attempted_calls: number
  connected_calls: number
  voicemail_count: number
  no_answer_count: number
  meetings_booked: number
  metadata: Record<string, unknown>
  created_at: string
}

/** Live stats for an in-progress session (computed from comm logs since start). */
export type LiveSessionStats = {
  attempted: number
  connected: number
  voicemail: number
  noAnswer: number
  meetings: number
}

export const DEFAULT_DAILY_CALL_GOAL = 25
