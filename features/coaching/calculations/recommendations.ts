// ─────────────────────────────────────────────────────────────────────────
// Self-correcting assumptions + smart coaching insights. Pure heuristics, no AI.
// Measure actual vs assumed, RECOMMEND (never auto-overwrite). Generate the
// operational coaching lines that make Jubo feel like a business coach.
// ─────────────────────────────────────────────────────────────────────────

import type {
  CoachInsight, ConversionVariance, ExecutionScore, Forecast, PartnerMetrics, ReverseEngineeredPlan,
} from '../types'

export function analyzeVariance(
  key: string,
  label: string,
  assumed: number,
  measured: number,
  sampleSize: number,
): ConversionVariance {
  const variancePercent = assumed > 0 ? ((measured - assumed) / assumed) * 100 : 0
  const direction: 'better' | 'worse' = measured >= assumed ? 'better' : 'worse'
  const confidence = sampleSize < 5 ? 'low' : sampleSize < 20 ? 'medium' : 'high'
  let recommendation: string | null = null
  if (sampleSize >= 10 && Math.abs(variancePercent) >= 15) {
    recommendation = `Your measured ${label.toLowerCase()} is ${(measured * 100).toFixed(0)}% vs ${(assumed * 100).toFixed(0)}% assumed (${sampleSize} sample). Consider updating your baseline.`
  }
  return {
    key, label, assumed, measured, sampleSize,
    variancePercent: Math.round(variancePercent),
    direction, confidence, recommendation,
  }
}

/**
 * Operational coaching from the computed snapshot. Heuristic, prioritized.
 * "Talk-tos" (conversations) are the activity unit, not dials.
 */
export function generateCoachInsights(input: {
  plan: ReverseEngineeredPlan | null
  partner: PartnerMetrics
  forecasts: Forecast[]
  execution: ExecutionScore
  talkTosThisWeek: number
  variances: ConversionVariance[]
}): CoachInsight[] {
  const out: CoachInsight[] = []
  const { plan, partner, forecasts, execution, talkTosThisWeek, variances } = input

  // Income/closings projection.
  const income = forecasts.find((f) => f.metric === 'income')
  if (income && plan) {
    if (income.variancePercent <= -15) {
      out.push({
        type: 'pacing_behind', tone: 'urgent', icon: 'TrendingDown',
        title: 'Behind your income goal',
        body: `On current pace you're trending to $${Math.round(income.projected).toLocaleString()} vs your $${Math.round(income.target).toLocaleString()} goal.`,
        suggestion: `Add talk-tos: aim for ${plan.dailyConversations.toFixed(1)} real conversations a day.`,
      })
    } else if (income.variancePercent >= 10) {
      out.push({
        type: 'pacing_ahead', tone: 'good', icon: 'TrendingUp',
        title: 'Ahead of your income goal',
        body: `Projecting $${Math.round(income.projected).toLocaleString()} — ${income.variancePercent}% above goal. Keep the momentum.`,
      })
    }
  }

  // Partner pipeline gap.
  if (partner.partnerGap > 0 && plan) {
    out.push({
      type: 'partner_pipeline_shrinking', tone: 'warn', icon: 'Handshake',
      title: 'Partner pipeline is short',
      body: `You have ${partner.activePartners} active partners but need ~${partner.partnersNeeded} to hit your goal.`,
      suggestion: `Acquiring partners takes conversations — book partner talk-tos this week.`,
    })
  }

  // Talk-to pace vs partner conversations.
  if (plan && partner.weeklyConversationTarget > 0 && partner.conversationPacePercent < 70) {
    const remaining = Math.max(0, Math.ceil(partner.weeklyConversationTarget - partner.conversationsThisWeek))
    out.push({
      type: 'talk_to_shortfall', tone: 'warn', icon: 'Users',
      title: 'Behind on partner conversations',
      body: `${remaining} more partner conversation${remaining === 1 ? '' : 's'} this week to stay on pace.`,
    })
  }

  // Calls vs conversations imbalance (talk-to philosophy).
  if (plan && talkTosThisWeek > 0 && plan.weeklyConversations > 0 && talkTosThisWeek < plan.weeklyConversations * 0.6) {
    out.push({
      type: 'conversion_drop', tone: 'info', icon: 'PhoneCall',
      title: 'Conversations lagging the plan',
      body: `${talkTosThisWeek} talk-tos this week vs a ${Math.ceil(plan.weeklyConversations)} target — quality conversations move the needle more than dials.`,
    })
  }

  // At-risk partners.
  if (partner.atRiskPartners > 0) {
    out.push({
      type: 'partner_cooling_off', tone: 'warn', icon: 'PhoneOff',
      title: 'Partners going cold',
      body: `${partner.atRiskPartners} partner${partner.atRiskPartners === 1 ? '' : 's'} haven't heard from you recently — reconnect before they drift.`,
    })
  }

  // Execution score.
  if (execution.overall >= 85) {
    out.push({ type: 'execution_strong', tone: 'good', icon: 'Zap', title: 'Strong execution', body: `Execution score ${execution.overall} — disciplined week.` })
  } else if (execution.overall < 60) {
    out.push({ type: 'execution_low', tone: 'warn', icon: 'AlertTriangle', title: 'Execution slipping', body: `Execution score ${execution.overall} — tighten up on daily talk-tos and follow-ups.` })
  }

  // Self-correcting assumption nudges.
  for (const v of variances) {
    if (v.recommendation) {
      out.push({
        type: 'referral_rate_variance', tone: 'info', icon: 'Gauge',
        title: `${v.label} differs from plan`,
        body: v.recommendation,
        suggestion: 'Update it in coaching assumptions when you trust the trend.',
      })
    }
  }

  return out
}
