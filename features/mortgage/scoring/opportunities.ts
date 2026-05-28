// ─────────────────────────────────────────────────────────────────────────
// Opportunity / attention engine — rules + heuristics (NO AI).
//
// Reads the loaded workspace data and surfaces operational signals. Pure: takes
// data + template key, returns a ranked list. Reused in the workspace, and the
// same primitives feed Today coaching.
// ─────────────────────────────────────────────────────────────────────────

import { daysSinceLastTouch, daysUntil, dateValue, numberValue, textValue } from '../data'
import { getCommunicationCounts, getLastContactedAt } from '@/features/communications/metrics'
import type { CommunicationLog } from '@/features/communications/types'
import type { MortgageData, OpportunitySignal, WorkspaceTemplateKey } from '../types'

const HIGH_VALUE_LOAN = 600_000
const STALE_DAYS = 14
const STALLED_FILE_DAYS = 21
const PARTNER_COOLING_DAYS = 30
const EXPIRY_WINDOW = 14
const CLOSING_WINDOW = 10

const LEVEL_RANK: Record<OpportunitySignal['level'], number> = { urgent: 0, warning: 1, positive: 2, info: 3 }

export function computeOpportunitySignals(data: MortgageData, template: WorkspaceTemplateKey): OpportunitySignal[] {
  const out: OpportunitySignal[] = []
  const isActive = data.record?.status === 'active'
  const touch = daysSinceLastTouch(data)

  // Overdue next action — the sharpest operational signal.
  const due = data.record?.next_action_due_at
  if (data.record?.next_action && due && !data.record?.next_action_completed_at) {
    const d = daysUntil(due)
    if (d != null && d < 0) {
      out.push({ key: 'overdue_next_action', level: 'urgent', icon: 'AlarmClock', label: 'Next action overdue', detail: `${Math.abs(d)}d past due` })
    }
  }

  // Preapproval expiring.
  const preExp = dateValue(data, 'preapproval_expiration')
  if (preExp) {
    const d = daysUntil(preExp)
    if (d != null && d >= 0 && d <= EXPIRY_WINDOW) {
      out.push({ key: 'preapproval_expiring', level: d <= 5 ? 'urgent' : 'warning', icon: 'ShieldAlert', label: 'Preapproval expiring', detail: `in ${d}d` })
    }
  }

  // Closing date approaching (loans).
  const close = dateValue(data, 'target_close_date')
  if (close) {
    const d = daysUntil(close)
    if (d != null && d >= 0 && d <= CLOSING_WINDOW) {
      out.push({ key: 'closing_soon', level: 'info', icon: 'CalendarClock', label: 'Closing approaching', detail: `in ${d}d` })
    }
  }

  // High-value loan.
  const amount = numberValue(data, 'loan_amount')
  if (amount && amount >= HIGH_VALUE_LOAN) {
    out.push({ key: 'high_value', level: 'positive', icon: 'TrendingUp', label: 'High-value opportunity', detail: `$${amount.toLocaleString()}` })
  }

  // Staleness — tuned per template.
  if (isActive && touch != null) {
    if (template === 'loan' && touch >= STALLED_FILE_DAYS) {
      out.push({ key: 'stalled_file', level: 'warning', icon: 'PauseCircle', label: 'Stalled file', detail: `no activity ${touch}d` })
    } else if (template === 'partner' && touch >= PARTNER_COOLING_DAYS) {
      out.push({ key: 'partner_cooling', level: 'warning', icon: 'Snowflake', label: 'Partner cooling off', detail: `${touch}d since last touch` })
    } else if ((template === 'lead' || template === 'past_client') && touch >= STALE_DAYS) {
      out.push({ key: 'no_contact', level: 'warning', icon: 'PhoneOff', label: 'No recent contact', detail: `${touch}d since last touch` })
    }
  }

  // Refinance potential (past clients).
  if (template === 'past_client') {
    const refi = textValue(data, 'refi_opportunity')
    if (refi === 'true' || refi === 'Yes') {
      out.push({ key: 'refi_potential', level: 'positive', icon: 'RefreshCcw', label: 'Refinance potential', detail: 'flagged on file' })
    }
  }

  // Partner producing.
  if (template === 'partner') {
    const refs = numberValue(data, 'referrals_ytd')
    if (refs && refs >= 3) {
      out.push({ key: 'top_referrer', level: 'positive', icon: 'Award', label: 'Active referrer', detail: `${refs} referrals YTD` })
    }
  }

  // ── Communication-derived signals ──────────────────────────────────────────
  const logs = (data.communications ?? []) as unknown as CommunicationLog[]
  if (logs.length > 0) {
    const counts = getCommunicationCounts(logs)
    if (counts.noAnswerStreak >= 2) {
      out.push({ key: 'multiple_no_answer', level: 'warning', icon: 'PhoneOff', label: 'Multiple no-answers', detail: `${counts.noAnswerStreak} attempts in a row` })
    }
    // Follow-up promised and now due/overdue.
    const dueFollowUp = logs.some((l) => l.follow_up_at && (daysUntil(l.follow_up_at) ?? 1) <= 0)
    if (dueFollowUp) {
      out.push({ key: 'followup_due', level: 'warning', icon: 'CalendarClock', label: 'Follow-up due', detail: 'from a logged call' })
    }
    // Contacted but nothing scheduled next.
    const hasNext = data.record?.next_action && !data.record?.next_action_completed_at
    const hasFutureFollowUp = logs.some((l) => l.follow_up_at && (daysUntil(l.follow_up_at) ?? -1) > 0)
    if (getLastContactedAt(logs) && !hasNext && !hasFutureFollowUp && (template === 'lead' || template === 'loan')) {
      out.push({ key: 'no_followup_set', level: 'info', icon: 'BellOff', label: 'No follow-up set', detail: 'contacted, nothing scheduled' })
    }
  }

  return out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level])
}
