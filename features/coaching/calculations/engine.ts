// ─────────────────────────────────────────────────────────────────────────
// Reverse-engineering engine — income goal -> daily talk-tos. Pure, no I/O.
// Partners -> Leads -> Closings doctrine. Talk-tos (conversations) are the unit.
// ─────────────────────────────────────────────────────────────────────────

import type { Baselines, ReverseEngineeredPlan } from '../types'

const safeDiv = (n: number, d: number) => (d > 0 ? n / d : 0)

export function reverseEngineerPlan(incomeGoal: number, b: Baselines): ReverseEngineeredPlan {
  const notes: string[] = []

  // Income -> closings
  const closingTarget = safeDiv(incomeGoal, b.avgCommission)
  notes.push(`$${Math.round(incomeGoal).toLocaleString()} ÷ $${Math.round(b.avgCommission).toLocaleString()}/loan = ${closingTarget.toFixed(1)} closings`)

  // Work backward through the funnel
  const fundedTarget = closingTarget
  const preapprovedTarget = safeDiv(fundedTarget, b.preapprovedToClosedRate)
  const appTarget = safeDiv(preapprovedTarget, b.appToPreapprovedRate)
  const connectedTarget = safeDiv(appTarget, b.connectedToAppRate)
  const leadsTarget = safeDiv(connectedTarget, b.leadToConnectedRate)
  notes.push(`Funnel: ${Math.ceil(leadsTarget)} leads → ${Math.ceil(connectedTarget)} conversations → ${Math.ceil(preapprovedTarget)} preapproved → ${Math.ceil(fundedTarget)} funded`)

  // Leads -> partners (partner-sourced model). Each partner yields leadsPerPartner/year.
  const partnersNeeded = safeDiv(leadsTarget, b.leadsPerPartner)
  notes.push(`${Math.ceil(leadsTarget)} leads ÷ ${b.leadsPerPartner} leads/partner = ${partnersNeeded.toFixed(1)} committed partners`)

  // Partners -> conversations (talk-tos)
  const yearlyConversations = partnersNeeded * b.conversationsPerPartner
  const weeklyConversations = safeDiv(yearlyConversations, b.workingWeeksPerYear)
  const dailyConversations = safeDiv(weeklyConversations, b.workingDaysPerWeek)
  notes.push(`${Math.round(yearlyConversations)} talk-tos/yr ÷ ${b.workingWeeksPerYear} wks = ${weeklyConversations.toFixed(1)}/wk → ${dailyConversations.toFixed(1)}/day`)

  const weeklyLeads = safeDiv(leadsTarget, b.workingWeeksPerYear)
  const weeklyPartnerAdds = safeDiv(partnersNeeded, b.workingWeeksPerYear)

  return {
    incomeGoal,
    closingTarget,
    fundedTarget,
    preapprovedTarget,
    appTarget,
    connectedTarget,
    leadsTarget,
    partnersNeeded,
    yearlyConversations,
    weeklyConversations,
    dailyConversations,
    weeklyLeads,
    weeklyPartnerAdds,
    baselines: b,
    notes,
  }
}

/** Derive an income goal from a production goal's targets, using baselines as fallback. */
export function inferIncomeGoal(
  goal: { target_revenue: number | null; target_units: number | null } | null,
  b: Baselines,
): number | null {
  if (!goal) return null
  if (goal.target_revenue && goal.target_revenue > 0) return Number(goal.target_revenue)
  if (goal.target_units && goal.target_units > 0) return Number(goal.target_units) * b.avgCommission
  return null
}
