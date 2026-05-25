// ─────────────────────────────────────────────────────────────────────────
// Onboarding → workflow enablement mapping.
//
// All 6 starter workflows are installed for every org (ensureDefaultWorkflows).
// This maps the LO's answers + focus weights to WHICH ones stay enabled, so the
// automation set feels intelligent without any new engine logic. Template ids
// reference features/workflows/registry/templates.ts.
// ─────────────────────────────────────────────────────────────────────────

import type { OnboardingAnswers, FocusWeights, FocusArea } from '../types'

// Universal hygiene — on for everyone.
const ALWAYS_ON = ['stale-reengagement', 'overdue-next-action']

function topFocus(weights: FocusWeights): FocusArea[] {
  return (Object.entries(weights) as [FocusArea, number][])
    .filter(([, w]) => (w ?? 0) > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area)
}

/** Returns the set of workflow template ids that should be ENABLED for this LO. */
export function computeEnabledWorkflows(
  answers: OnboardingAnswers,
  weights: FocusWeights,
): Set<string> {
  const enabled = new Set<string>(ALWAYS_ON)
  const focus = new Set(topFocus(weights))

  // New-lead follow-up — self-sourcers, lead-buyers, prospecting/conversion focus
  if (answers.self_source || answers.buys_leads || focus.has('prospecting') || focus.has('conversion')) {
    enabled.add('lead-follow-up')
  }

  // Pipeline automations — anyone moving files, or pipeline-focused
  if (focus.has('pipeline') || answers.target_closings) {
    enabled.add('needs-docs')
    enabled.add('contract-checklist')
  }

  // Nurture — past-client / retention / partner-driven LOs
  if (answers.past_clients || answers.realtor_leads || focus.has('retention') || focus.has('partner_growth') || focus.has('follow_up')) {
    enabled.add('nurture-follow-up')
  }

  return enabled
}
