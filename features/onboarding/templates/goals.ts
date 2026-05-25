// ─────────────────────────────────────────────────────────────────────────
// Starter GOAL / FUNNEL template — pure data.
//
// Describes a starter production funnel + conversion assumptions. The numbers
// here are STARTER ASSUMPTIONS (clearly noted), not hardcoded platform math —
// they're written into the editable conversion_assumptions table so the LO can
// tune them. The goal-engine derives all pacing from these + the goal target.
// ─────────────────────────────────────────────────────────────────────────

export type FunnelStageSpec = {
  key: string          // stable key for wiring assumptions
  name: string
  slug: string
  stage_type: string   // 'activity' | 'qualification' | 'outcome'
}

export type ConversionAssumptionSpec = {
  fromKey: string
  toKey: string
  rate: number         // 0..1 — starter default, editable later
  note: string
}

export type GoalFunnelTemplate = {
  funnelName: string
  funnelDescription: string
  stages: FunnelStageSpec[]
  assumptions: ConversionAssumptionSpec[]
}

export const STARTER_FUNNEL: GoalFunnelTemplate = {
  funnelName: 'Production Funnel',
  funnelDescription: 'Starter mortgage funnel — leads through funded. Adjust the conversion rates to match your real numbers.',
  stages: [
    { key: 'leads',          name: 'Leads',          slug: 'leads',          stage_type: 'activity' },
    { key: 'connected',      name: 'Connected',      slug: 'connected',      stage_type: 'activity' },
    { key: 'preapproved',    name: 'Preapproved',    slug: 'preapproved',    stage_type: 'qualification' },
    { key: 'under_contract', name: 'Under Contract', slug: 'under-contract', stage_type: 'qualification' },
    { key: 'funded',         name: 'Funded',         slug: 'funded',         stage_type: 'outcome' },
  ],
  assumptions: [
    { fromKey: 'leads',          toKey: 'connected',      rate: 0.40, note: 'Starter assumption — adjust to your contact rate' },
    { fromKey: 'connected',      toKey: 'preapproved',    rate: 0.50, note: 'Starter assumption — adjust to your preapproval rate' },
    { fromKey: 'preapproved',    toKey: 'under_contract', rate: 0.45, note: 'Starter assumption — adjust to your contract rate' },
    { fromKey: 'under_contract', toKey: 'funded',         rate: 0.85, note: 'Starter assumption — adjust to your pull-through' },
  ],
}

/**
 * Maps each starter funnel stage to a starter board group (by board slug +
 * group name). This is what lets goal pacing read LIVE record counts: the final
 * stage points at a real group, and /today counts records there. Applied at
 * provisioning and re-applied after each import.
 */
export const STAGE_GROUP_MAP: Record<string, { boardSlug: string; groupName: string }> = {
  leads:          { boardSlug: 'active-leads',  groupName: 'New Inquiry' },
  connected:      { boardSlug: 'active-leads',  groupName: 'Credit Pull' },
  preapproved:    { boardSlug: 'active-leads',  groupName: 'Preapproved' },
  under_contract: { boardSlug: 'active-leads',  groupName: 'Under Contract' },
  funded:         { boardSlug: 'loan-pipeline', groupName: 'Funded' },
}

/** The headline target a goal tracks (units), with sane fallbacks. */
export function resolveGoalTargets(answers: {
  target_closings?: number
  target_volume?: number
  target_income?: number
}): { units: number; volume: number | null; revenue: number | null } {
  const units = answers.target_closings && answers.target_closings > 0 ? answers.target_closings : 24
  return {
    units,
    volume:  answers.target_volume && answers.target_volume > 0 ? answers.target_volume : null,
    revenue: answers.target_income && answers.target_income > 0 ? answers.target_income : null,
  }
}
