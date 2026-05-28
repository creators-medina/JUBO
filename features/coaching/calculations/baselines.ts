// ─────────────────────────────────────────────────────────────────────────
// Baselines — doctrine defaults + override resolution. Pure, no I/O.
// Defaults are STARTERS; org + user overrides (coaching_assumptions) win.
// ─────────────────────────────────────────────────────────────────────────

import type { Baselines, CoachingAssumptionsRow } from '../types'

export const DEFAULT_BASELINES: Baselines = {
  leadsPerPartner: 8,
  conversationsPerPartner: 20,
  referralConversionRate: 0.25,
  workingWeeksPerYear: 50,
  workingDaysPerWeek: 5,
  avgCommission: 5000,
  avgLoanSize: 350000,
  leadToFundedRate: 0.25,
  leadToConnectedRate: 0.40,
  connectedToAppRate: 0.50,
  appToPreapprovedRate: 0.45,
  preapprovedToClosedRate: 0.85,
  weeklyTalkToFloorPercent: 80,
  staleBoundaryDays: 21,
  partnerAtRiskDays: 60,
}

function num(v: number | null | undefined, fallback: number): number {
  return v == null || Number.isNaN(Number(v)) ? fallback : Number(v)
}

/** Layer a DB assumptions row on top of a base Baselines (row values win when present). */
export function applyRow(base: Baselines, row: CoachingAssumptionsRow | null): Baselines {
  if (!row) return base
  return {
    leadsPerPartner: num(row.leads_per_partner, base.leadsPerPartner),
    conversationsPerPartner: num(row.conversations_per_partner, base.conversationsPerPartner),
    referralConversionRate: num(row.referral_conversion_rate, base.referralConversionRate),
    workingWeeksPerYear: num(row.working_weeks_per_year, base.workingWeeksPerYear),
    workingDaysPerWeek: num(row.working_days_per_week, base.workingDaysPerWeek),
    avgCommission: num(row.avg_commission, base.avgCommission),
    avgLoanSize: row.avg_loan_size == null ? base.avgLoanSize : Number(row.avg_loan_size),
    leadToFundedRate: num(row.lead_to_funded_rate, base.leadToFundedRate),
    leadToConnectedRate: num(row.lead_to_connected_rate, base.leadToConnectedRate),
    connectedToAppRate: num(row.connected_to_app_rate, base.connectedToAppRate),
    appToPreapprovedRate: num(row.app_to_preapproved_rate, base.appToPreapprovedRate),
    preapprovedToClosedRate: num(row.preapproved_to_closed_rate, base.preapprovedToClosedRate),
    weeklyTalkToFloorPercent: num(row.weekly_talk_to_floor_percent, base.weeklyTalkToFloorPercent),
    staleBoundaryDays: Math.round(num(row.stale_boundary_days, base.staleBoundaryDays)),
    partnerAtRiskDays: Math.round(num(row.partner_at_risk_days, base.partnerAtRiskDays)),
  }
}

/** Resolve effective baselines: defaults <- org-wide row <- user row. */
export function resolveBaselines(
  orgRow: CoachingAssumptionsRow | null,
  userRow: CoachingAssumptionsRow | null,
): Baselines {
  return applyRow(applyRow(DEFAULT_BASELINES, orgRow), userRow)
}
