// ─────────────────────────────────────────────────────────────────────────
// Production Plan math — Phase 3's pure calculation module.
//
// Reverse-engineers an LO's annual NET comp goal into required funded
// loans, leads by source, and weekly/monthly activity. Pure functions
// only: no data fetching, no side effects — everything here is trivially
// unit-testable and reusable (the same math the onboarding intake will
// feed in Phase 4).
//
// Every number in = an EDITABLE ASSUMPTION the LO owns (never a stored
// production fact); every number out is derived arithmetic. Division
// guards return null instead of Infinity/NaN so the UI can show "—".
// ─────────────────────────────────────────────────────────────────────────

/** The future lead-source picker categories (docs/JUBO_PRODUCT_DECISIONS.md).
 *  Planning-only in Phase 3 — no lead-source fields exist on records yet. */
export const LEAD_SOURCES = [
  { key: 'realtor_referral', label: 'Realtor Referral' },
  { key: 'current_client_referral', label: 'Current Client Referral' },
  { key: 'past_client_repeat', label: 'Past Client Repeat' },
  { key: 'past_client_referral', label: 'Past Client Referral' },
  { key: 'builder', label: 'Builder' },
  { key: 'business_owner', label: 'Business Owner' },
  { key: 'personal_friend', label: 'Personal Friend' },
  { key: 'vip', label: 'VIP' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'facebook_ad', label: 'Facebook Ad' },
  { key: 'website_lead', label: 'Website Lead' },
  { key: 'online_lead', label: 'Online Lead' },
  { key: 'open_house', label: 'Open House' },
  { key: 'event', label: 'Event' },
  { key: 'other', label: 'Other' },
] as const

export type LeadSourceKey = (typeof LEAD_SOURCES)[number]['key']

/** Starting CONVERSION assumptions (lead → funded), in percent. Editable and
 *  labeled as assumptions in the UI — never presented as facts. */
export const DEFAULT_CONVERSION_RATES: Record<LeadSourceKey, number> = {
  realtor_referral: 25,
  current_client_referral: 25,
  past_client_repeat: 50,
  past_client_referral: 25,
  builder: 25,
  business_owner: 25,
  personal_friend: 25,
  vip: 25,
  instagram: 5,
  facebook_ad: 5,
  website_lead: 5,
  online_lead: 5,
  open_house: 10,
  event: 10,
  other: 10,
}

/** Suggested starting TARGET mix (sums to 100). A referral-weighted default
 *  matching the product's call rhythm (realtor-first); purely a starting
 *  point for the LO to edit — documented, not asserted as their business. */
export const DEFAULT_SOURCE_MIX: Record<LeadSourceKey, number> = {
  realtor_referral: 40,
  current_client_referral: 10,
  past_client_repeat: 10,
  past_client_referral: 10,
  builder: 5,
  business_owner: 5,
  personal_friend: 5,
  vip: 5,
  instagram: 2,
  facebook_ad: 2,
  website_lead: 2,
  online_lead: 2,
  open_house: 1,
  event: 1,
  other: 0,
}

export const PLAN_DEFAULTS = {
  /** Suggested annual NET LO comp goal (not company revenue). */
  annualNetIncomeGoal: 500_000,
  grossCompBps: 275,
  loSplitPercent: 80,
} as const

export type PlanAssumptions = {
  /** Annual NET LO comp goal in dollars. */
  annualNetIncomeGoal: number
  /** Average loan amount in dollars — null until the LO enters one (no
   *  invented default: it's their market, not ours). */
  averageLoanAmount: number | null
  /** Gross comp in basis points (default 275). */
  grossCompBps: number
  /** LO's share of gross comp, in percent (default 80). */
  loSplitPercent: number
  /** Manual net-bps override; null → derived from gross × split. */
  netCompBpsOverride: number | null
  /** Target lead-source mix, percent per source. */
  mix: Record<LeadSourceKey, number>
  /** Lead → funded conversion assumption, percent per source. */
  conversionRates: Record<LeadSourceKey, number>
}

export type SourcePlanRow = {
  key: LeadSourceKey
  label: string
  mixPercent: number
  conversionPercent: number
  /** Funded loans this source must produce (exact, not rounded). */
  fundedLoans: number | null
  /** Leads this source needs at its conversion rate; null when the
   *  conversion assumption is 0 (can't divide honestly). */
  leadsNeeded: number | null
}

export type PlanResult = {
  /** avg loan × gross bps / 10,000 */
  grossRevenuePerLoan: number | null
  /** gross bps × split% — always shown so the override is comparable. */
  derivedNetBps: number
  /** The bps actually used (override when set, else derived). */
  effectiveNetBps: number
  usingOverride: boolean
  /** avg loan × effective net bps / 10,000 */
  netCompPerLoan: number | null
  /** goal ÷ net comp per loan (exact + rounded-up planning number). */
  requiredFundedExact: number | null
  requiredFundedLoans: number | null
  /** Sum of the mix percentages (UI warns when ≠ 100). */
  mixTotalPercent: number
  perSource: SourcePlanRow[]
  /** Sum of per-source leads (null when nothing is computable). */
  annualLeads: number | null
  monthlyLeads: number | null
  weeklyLeads: number | null
}

const positive = (n: number | null | undefined): number | null =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null

export function computePlan(a: PlanAssumptions): PlanResult {
  const avgLoan = positive(a.averageLoanAmount)
  const goal = positive(a.annualNetIncomeGoal)
  const grossBps = positive(a.grossCompBps) ?? 0
  const split = positive(a.loSplitPercent) ?? 0

  const derivedNetBps = (grossBps * split) / 100
  const override = positive(a.netCompBpsOverride)
  const usingOverride = override != null
  const effectiveNetBps = override ?? derivedNetBps

  const grossRevenuePerLoan = avgLoan != null ? (avgLoan * grossBps) / 10_000 : null
  const netCompPerLoan = avgLoan != null && effectiveNetBps > 0 ? (avgLoan * effectiveNetBps) / 10_000 : null

  const requiredFundedExact = goal != null && netCompPerLoan != null && netCompPerLoan > 0 ? goal / netCompPerLoan : null
  const requiredFundedLoans = requiredFundedExact != null ? Math.ceil(requiredFundedExact) : null

  let mixTotalPercent = 0
  let leadsSum = 0
  let anyLeads = false
  const perSource: SourcePlanRow[] = LEAD_SOURCES.map(({ key, label }) => {
    const mixPercent = positive(a.mix[key]) ?? 0
    const conversionPercent = positive(a.conversionRates[key]) ?? 0
    mixTotalPercent += mixPercent
    const fundedLoans = requiredFundedExact != null ? (requiredFundedExact * mixPercent) / 100 : null
    const leadsNeeded = fundedLoans != null && conversionPercent > 0 ? fundedLoans / (conversionPercent / 100) : null
    if (leadsNeeded != null) { leadsSum += leadsNeeded; anyLeads = true }
    return { key, label, mixPercent, conversionPercent, fundedLoans, leadsNeeded }
  })

  const annualLeads = anyLeads ? Math.ceil(leadsSum) : null
  return {
    grossRevenuePerLoan,
    derivedNetBps,
    effectiveNetBps,
    usingOverride,
    netCompPerLoan,
    requiredFundedExact,
    requiredFundedLoans,
    mixTotalPercent,
    perSource,
    annualLeads,
    monthlyLeads: anyLeads ? Math.ceil(leadsSum / 12) : null,
    weeklyLeads: anyLeads ? Math.ceil(leadsSum / 52) : null,
  }
}

/** Build assumptions from saved onboarding answers + documented defaults.
 *  Saved values win; missing ones fall back (average loan amount stays null
 *  — a placeholder is shown, never a fake saved number). */
export function assumptionsFromAnswers(answers: Record<string, unknown>): PlanAssumptions {
  const num = (v: unknown): number | null => {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const rec = (v: unknown, defaults: Record<LeadSourceKey, number>): Record<LeadSourceKey, number> => {
    const out = { ...defaults }
    if (v && typeof v === 'object') {
      for (const { key } of LEAD_SOURCES) {
        const n = num((v as Record<string, unknown>)[key])
        if (n != null || (v as Record<string, unknown>)[key] === 0) out[key] = n ?? 0
      }
    }
    return out
  }
  return {
    annualNetIncomeGoal: num(answers.production_plan_annual_net_income_goal) ?? PLAN_DEFAULTS.annualNetIncomeGoal,
    // Falls back to the LO's own onboarding "average loan size" answer (their
    // stated history — not an invented number) until a planning value is set.
    averageLoanAmount: num(answers.production_plan_average_loan_amount) ?? num(answers.average_loan_size),
    grossCompBps: num(answers.production_plan_gross_comp_bps) ?? PLAN_DEFAULTS.grossCompBps,
    loSplitPercent: num(answers.production_plan_lo_split_percent) ?? PLAN_DEFAULTS.loSplitPercent,
    netCompBpsOverride: num(answers.production_plan_net_comp_bps_override),
    mix: rec(answers.production_plan_lead_source_mix, DEFAULT_SOURCE_MIX),
    conversionRates: rec(answers.production_plan_conversion_rates, DEFAULT_CONVERSION_RATES),
  }
}
