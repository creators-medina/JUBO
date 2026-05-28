// ─────────────────────────────────────────────────────────────────────────
// Queue scoring + lead temperature — pure heuristics (no AI).
//
// Score answers "who needs a call most right now?" combining urgency,
// opportunity value, and relationship decay. Temperature is the relationship
// read shown as a badge. A theme-day weight can boost matching boards.
// ─────────────────────────────────────────────────────────────────────────

import type { CandidateSignal, LeadTemperature, QueueBucketKey, ScoredLead } from '../types'

function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.ceil((t - Date.now()) / 86400000)
}

export function temperatureFor(sig: CandidateSignal): LeadTemperature {
  const d = sig.daysSinceContact
  const highValue = (sig.loanAmount ?? 0) >= 400_000
  if (d == null) {
    // Never contacted: fresh records are warm-ish, old uncontacted go cold.
    const ageDays = Math.floor((Date.now() - new Date(sig.updatedAt).getTime()) / 86400000)
    return ageDays <= 3 ? 'warm' : ageDays <= 21 ? 'cold' : 'dormant'
  }
  if (d <= 2) return 'hot'
  if (d <= 7) return highValue ? 'hot' : 'warm'
  if (d <= 21) return 'cold'
  return 'dormant'
}

export function scoreCandidate(sig: CandidateSignal, opts: { themeBoardSlug?: string | null } = {}): ScoredLead {
  let score = 0
  const reasons: string[] = []
  let bucket: QueueBucketKey = 'fresh'

  // Overdue next action — top urgency.
  const dueIn = daysUntil(sig.nextActionDueAt)
  const hasOpenNext = sig.nextAction && !sig.nextActionCompletedAt
  if (hasOpenNext && dueIn != null && dueIn <= 0) {
    score += 60 + Math.min(20, Math.abs(dueIn) * 2)
    reasons.push(dueIn === 0 ? 'Follow-up due today' : `Follow-up ${Math.abs(dueIn)}d overdue`)
    bucket = 'overdue_followups'
  } else if (hasOpenNext && dueIn != null && dueIn <= 2) {
    score += 35
    reasons.push('Follow-up coming up')
    bucket = 'overdue_followups'
  }

  // Preapproval expiring.
  if (sig.preapprovalExpDays != null && sig.preapprovalExpDays >= 0 && sig.preapprovalExpDays <= 14) {
    score += 50 - sig.preapprovalExpDays
    reasons.push(`Preapproval expires in ${sig.preapprovalExpDays}d`)
    if (bucket === 'fresh') bucket = 'expiring'
  }

  // Relationship decay (needs a touch).
  const d = sig.daysSinceContact
  if (d == null) {
    score += 18
    reasons.push('Never contacted')
    if (bucket === 'fresh') bucket = 'fresh'
  } else if (d >= 21) {
    score += 30
    reasons.push(`No contact in ${d}d`)
    if (bucket === 'fresh') bucket = 'stale'
  } else if (d >= 8) {
    score += 18
    reasons.push(`${d}d since last contact`)
    if (bucket === 'fresh') bucket = 'stale'
  } else if (d <= 2) {
    score += 8 // recently engaged → keep momentum
    reasons.push('Recent engagement')
    if (bucket === 'fresh') bucket = 'hot'
  }

  // Opportunity value.
  if ((sig.loanAmount ?? 0) >= 600_000) { score += 18; reasons.push('High-value loan') }
  else if ((sig.loanAmount ?? 0) >= 400_000) { score += 8; reasons.push('Strong loan value') }

  // Explicit priority.
  if (sig.priority === 'urgent') { score += 20; reasons.push('Marked urgent') }
  else if (sig.priority === 'high') { score += 10; reasons.push('High priority') }

  // Partner board bucket.
  if (sig.boardSlug === 'realtors-partners') {
    if (bucket === 'fresh' || bucket === 'stale') bucket = 'partners'
    if (d != null && d >= 30) { score += 15; reasons.push('Partner cooling off') }
  }

  // Theme-day boost.
  if (opts.themeBoardSlug && sig.boardSlug === opts.themeBoardSlug) {
    score += 25
    reasons.push("Today's focus")
  }

  const temperature = temperatureFor(sig)
  if (temperature === 'hot' && bucket === 'fresh') bucket = 'hot'

  return {
    recordId: sig.recordId,
    title: sig.title,
    boardId: sig.boardId,
    boardSlug: sig.boardSlug,
    groupName: sig.groupName,
    temperature,
    score: Math.round(score),
    reasons: reasons.slice(0, 3),
    bucket,
    loanAmount: sig.loanAmount,
    daysSinceContact: sig.daysSinceContact,
    nextActionDueAt: sig.nextActionDueAt,
  }
}
