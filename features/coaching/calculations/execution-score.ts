// ─────────────────────────────────────────────────────────────────────────
// Execution score — 0..100 blend of the daily/weekly behaviors that drive
// production. Talk-tos are weighted highest. Pure, no I/O.
// ─────────────────────────────────────────────────────────────────────────

import type { ExecutionFactor, ExecutionInterpretation, ExecutionScore } from '../types'

export type ExecutionInput = {
  talkTosThisWeek: number
  talkToWeeklyTarget: number
  overdueActions: number
  openActions: number
  stalePartners: number
  totalPartners: number
  prospectingStreakDays: number
  pacePercent: number              // progress vs expected for active goals (0..100+)
}

const clamp100 = (n: number) => Math.max(0, Math.min(100, n))

export function calculateExecutionScore(input: ExecutionInput): ExecutionScore {
  const talkTo = input.talkToWeeklyTarget > 0
    ? clamp100((input.talkTosThisWeek / input.talkToWeeklyTarget) * 100)
    : (input.talkTosThisWeek > 0 ? 100 : 0)

  const followUp = input.openActions > 0
    ? clamp100((1 - input.overdueActions / input.openActions) * 100)
    : 100

  const relationships = input.totalPartners > 0
    ? clamp100((1 - input.stalePartners / input.totalPartners) * 100)
    : 100

  const streak = clamp100((input.prospectingStreakDays / 7) * 100)

  const pacing = clamp100(input.pacePercent)

  const factors: ExecutionFactor[] = [
    { key: 'talk_tos', label: 'Talk-to pace', value: Math.round(talkTo), weight: 0.30 },
    { key: 'pacing', label: 'Goal pacing', value: Math.round(pacing), weight: 0.25 },
    { key: 'follow_up', label: 'Follow-up discipline', value: Math.round(followUp), weight: 0.20 },
    { key: 'relationships', label: 'Relationship freshness', value: Math.round(relationships), weight: 0.15 },
    { key: 'streak', label: 'Consistency streak', value: Math.round(streak), weight: 0.10 },
  ]

  const overall = Math.round(factors.reduce((sum, f) => sum + f.value * f.weight, 0))
  return { overall, interpretation: interpret(overall), factors }
}

function interpret(score: number): ExecutionInterpretation {
  if (score >= 90) return 'excellent'
  if (score >= 75) return 'good'
  if (score >= 60) return 'fair'
  return 'needs_work'
}
