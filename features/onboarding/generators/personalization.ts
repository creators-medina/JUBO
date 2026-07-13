// ─────────────────────────────────────────────────────────────────────────
// Personalization engine — pure function.
//
// Turns answers + focus weights into a tailoring summary: which dashboard is
// default, board ordering, which workflows to emphasize, and the Today cockpit
// priority. Read by the rest of the app; no engine logic, just derivation.
// ─────────────────────────────────────────────────────────────────────────

import type { OnboardingAnswers, FocusWeights, FocusArea, Personalization } from '../types'
import { computeEnabledWorkflows } from '../templates/workflows'

function rankedFocus(weights: FocusWeights): FocusArea[] {
  return (Object.entries(weights) as [FocusArea, number][])
    .filter(([, w]) => (w ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area)
}

export function computePersonalization(
  answers: OnboardingAnswers,
  weights: FocusWeights,
): Personalization {
  const ranked = rankedFocus(weights)
  const primary = ranked[0]

  // Default dashboard follows the dominant focus.
  let defaultDashboard = 'win-the-day'
  if (primary === 'pipeline') defaultDashboard = 'pipeline'
  else if (primary === 'conversion' || primary === 'recruiting') defaultDashboard = 'production'

  // Board ordering — lead with what the LO cares about most. Includes the
  // Daily Call Log theme-day sources (pre_approved / inactive_loans / vips);
  // any template key omitted here is still provisioned (appended by orderBoards).
  const baseOrder = ['prospecting', 'active_leads', 'pre_approved', 'pipeline', 'inactive_loans', 'past_clients', 'partners', 'vips']
  const order = [...baseOrder]
  const pin = (key: string) => {
    const i = order.indexOf(key)
    if (i > 0) { order.splice(i, 1); order.unshift(key) }
  }
  if (primary === 'pipeline') pin('pipeline')
  else if (primary === 'retention') pin('past_clients')
  else if (primary === 'partner_growth') pin('partners')
  else if (primary === 'prospecting' || primary === 'conversion') pin('prospecting')

  // Today cockpit priority.
  let todayPriority: Personalization['today_priority'] = 'balanced'
  if (primary === 'prospecting' || primary === 'conversion') todayPriority = 'prospecting'
  else if (primary === 'pipeline') todayPriority = 'pipeline'
  else if (primary === 'follow_up' || primary === 'retention') todayPriority = 'follow_up'

  return {
    primary_focus: primary,
    default_dashboard_key: defaultDashboard,
    board_order: order,
    emphasized_workflows: [...computeEnabledWorkflows(answers, weights)],
    today_priority: todayPriority,
  }
}
