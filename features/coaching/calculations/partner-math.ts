// ─────────────────────────────────────────────────────────────────────────
// Partner acquisition math — status, scoring, aggregate metrics. Pure, no I/O.
// ─────────────────────────────────────────────────────────────────────────

import type { Baselines, PartnerHealth, PartnerMetrics, PartnerStatus, ReverseEngineeredPlan } from '../types'

export function classifyPartnerStatus(daysSinceContact: number | null, b: Baselines): PartnerStatus {
  if (daysSinceContact == null) return 'dormant'
  if (daysSinceContact <= b.staleBoundaryDays) return 'active'
  if (daysSinceContact <= b.partnerAtRiskDays) return 'cooling_off'
  return 'at_risk'
}

/** 0..100 partner score: lead volume vs target (60%) + recency (40%). */
export function partnerScore(leadsYtd: number, daysSinceContact: number | null, b: Baselines): number {
  const volume = Math.min(1, b.leadsPerPartner > 0 ? leadsYtd / b.leadsPerPartner : 0)
  const recency = daysSinceContact == null
    ? 0
    : Math.max(0, 1 - daysSinceContact / Math.max(1, b.partnerAtRiskDays))
  return Math.round((volume * 0.6 + recency * 0.4) * 100)
}

export function buildPartnerHealth(
  p: { recordId: string; name: string; boardId: string | null; daysSinceContact: number | null; leadsYtd: number; conversationsYtd: number; fundedYtd: number },
  b: Baselines,
): PartnerHealth {
  return {
    recordId: p.recordId,
    name: p.name,
    boardId: p.boardId,
    status: classifyPartnerStatus(p.daysSinceContact, b),
    daysSinceContact: p.daysSinceContact,
    leadsYtd: p.leadsYtd,
    conversationsYtd: p.conversationsYtd,
    fundedYtd: p.fundedYtd,
    score: partnerScore(p.leadsYtd, p.daysSinceContact, b),
  }
}

export function aggregatePartnerMetrics(
  partners: PartnerHealth[],
  plan: ReverseEngineeredPlan | null,
  conversationsThisWeek: number,
  b: Baselines,
): PartnerMetrics {
  const count = (s: PartnerStatus) => partners.filter((p) => p.status === s).length
  const activePartners = count('active')
  const leadsThisYear = partners.reduce((n, p) => n + p.leadsYtd, 0)
  const partnersNeeded = plan ? Math.ceil(plan.partnersNeeded) : 0
  const weeklyConversationTarget = plan ? plan.weeklyConversations : 0
  const topPartners = [...partners].sort((a, c) => c.score - a.score).slice(0, 5)

  return {
    totalPartners: partners.length,
    activePartners,
    coolingOffPartners: count('cooling_off'),
    atRiskPartners: count('at_risk'),
    dormantPartners: count('dormant'),
    leadsThisYear,
    leadsPerPartnerAvg: partners.length > 0 ? Math.round((leadsThisYear / partners.length) * 10) / 10 : 0,
    partnersNeeded,
    partnerGap: Math.max(0, partnersNeeded - activePartners),
    conversationsThisWeek,
    weeklyConversationTarget,
    conversationPacePercent: weeklyConversationTarget > 0
      ? Math.round((conversationsThisWeek / weeklyConversationTarget) * 100)
      : 0,
    topPartners,
  }
}
