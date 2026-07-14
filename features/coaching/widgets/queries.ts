// ─────────────────────────────────────────────────────────────────────────
// Coaching widget data fetchers. User+org scoped; called from the dashboard's
// bulk widget fetch. Each maps the live CoachingSnapshot to a widget shape.
// ─────────────────────────────────────────────────────────────────────────

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { isConnect } from '@/features/communications/outcomes'
import { getCoachingSnapshot } from '../queries'
import type {
  ExecutionScoreData, TalkToPaceData, PartnerGrowthData, ProjectionData,
  PartnerHealthData, PaceForecastData, WeeklyScorecardData,
  TalkToPaceWidgetConfig, PartnerGrowthWidgetConfig,
} from '../types'

// Wrapped in React cache() so the dashboard's many coaching widgets share ONE
// auth + membership lookup per request instead of one each.
const currentUser = cache(async (orgId: string): Promise<string | null> => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: m } = await supabase
    .from('organization_members').select('organization_id')
    .eq('user_id', user.id).eq('organization_id', orgId).limit(1).maybeSingle()
  return m ? user.id : null
})

export async function getExecutionScoreData(orgId: string): Promise<ExecutionScoreData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const s = await getCoachingSnapshot(orgId, userId)
  return { overall: s.execution.overall, interpretation: s.execution.interpretation, factors: s.execution.factors }
}

export async function getTalkToPaceData(config: TalkToPaceWidgetConfig, orgId: string): Promise<TalkToPaceData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const s = await getCoachingSnapshot(orgId, userId)
  const cadence = config.cadence ?? 'daily'
  const target = cadence === 'weekly' ? (s.plan?.weeklyConversations ?? 0) : (s.plan?.dailyConversations ?? 0)
  const actual = cadence === 'weekly' ? s.talkTosThisWeek : s.talkTosToday
  const pacePercent = target > 0 ? Math.round((actual / target) * 100) : (actual > 0 ? 100 : 0)
  const floor = s.baselines.weeklyTalkToFloorPercent
  const status: TalkToPaceData['status'] = pacePercent >= 100 ? 'ahead' : pacePercent >= floor ? 'on_pace' : 'behind'
  return {
    cadence, target: Math.round(target * 10) / 10, actual,
    remaining: Math.max(0, Math.ceil(target - actual)),
    pacePercent, status, source: s.plan ? 'Goal target' : 'Default target',
  }
}

export async function getPartnerGrowthData(config: PartnerGrowthWidgetConfig, orgId: string): Promise<PartnerGrowthData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const s = await getCoachingSnapshot(orgId, userId)
  const topN = config.top_n ?? 5
  return {
    activePartners: s.partner.activePartners,
    partnersNeeded: s.partner.partnersNeeded,
    partnerGap: s.partner.partnerGap,
    leaders: s.partner.topPartners.slice(0, topN).map((p) => ({ recordId: p.recordId, name: p.name, leadsYtd: p.leadsYtd, status: p.status })),
  }
}

function projection(metric: string, label: string, isCurrency: boolean, f: { current: number; target: number; projected: number; variancePercent: number; onTrack: boolean } | undefined): ProjectionData | null {
  if (!f) return null
  return { metric, label, current: f.current, target: f.target, projected: f.projected, variancePercent: f.variancePercent, onTrack: f.onTrack, isCurrency }
}

export async function getProjectedClosingsData(orgId: string): Promise<ProjectionData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const s = await getCoachingSnapshot(orgId, userId)
  return projection('closings', 'Projected closings', false, s.forecasts.find((f) => f.metric === 'closings'))
}

export async function getProjectedIncomeData(orgId: string): Promise<ProjectionData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const s = await getCoachingSnapshot(orgId, userId)
  return projection('income', 'Projected income', true, s.forecasts.find((f) => f.metric === 'income'))
}

export async function getPartnerHealthData(orgId: string): Promise<PartnerHealthData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const s = await getCoachingSnapshot(orgId, userId)
  const atRisk = s.partner.topPartners
    .filter((p) => p.status === 'at_risk' || p.status === 'cooling_off')
    .slice(0, 5)
    .map((p) => ({ recordId: p.recordId, name: p.name, daysSinceContact: p.daysSinceContact }))
  return {
    total: s.partner.totalPartners,
    active: s.partner.activePartners,
    coolingOff: s.partner.coolingOffPartners,
    atRisk: s.partner.atRiskPartners,
    dormant: s.partner.dormantPartners,
    topAtRisk: atRisk,
  }
}

export async function getPaceForecastData(orgId: string): Promise<PaceForecastData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const s = await getCoachingSnapshot(orgId, userId)
  return {
    rows: s.forecasts.map((f) => ({
      metric: f.metric, label: f.label, target: f.target, projected: f.projected,
      variancePercent: f.variancePercent, onTrack: f.onTrack, isCurrency: f.metric === 'income',
    })),
  }
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export async function getWeeklyScorecardData(orgId: string): Promise<WeeklyScorecardData | null> {
  const userId = await currentUser(orgId)
  if (!userId) return null
  const supabase = await createClient()
  const s = await getCoachingSnapshot(orgId, userId)

  const weekStart = new Date(); const diff = (weekStart.getDay() + 6) % 7
  weekStart.setDate(weekStart.getDate() - diff); weekStart.setHours(0, 0, 0, 0)

  const { data } = await supabase
    .from('communication_logs')
    .select('outcome, occurred_at, channel')
    .eq('organization_id', orgId)
    .eq('created_by', userId)
    .eq('channel', 'call')
    .gte('occurred_at', weekStart.toISOString())
  const logs = ((data as { outcome: string | null; occurred_at: string }[] | null) ?? []).filter((l) => isConnect(l.outcome))

  const perDay = new Array(7).fill(0)
  for (const l of logs) {
    const idx = (new Date(l.occurred_at).getDay() + 6) % 7
    perDay[idx] += 1
  }
  const dailyTarget = s.plan?.dailyConversations ?? 0
  const floorPct = s.baselines.weeklyTalkToFloorPercent
  const todayIdx = (new Date().getDay() + 6) % 7

  const days = perDay.map((n, i) => {
    if (i > todayIdx) return { label: DAY_LABELS[i], score: 0, status: 'none' as const }
    const pct = dailyTarget > 0 ? (n / dailyTarget) * 100 : (n > 0 ? 100 : 0)
    const status = pct >= 100 ? 'ahead' as const : pct >= floorPct ? 'on_pace' as const : 'behind' as const
    return { label: DAY_LABELS[i], score: n, status }
  })

  return {
    weeklyScore: s.execution.overall,
    talkTos: s.talkTosThisWeek,
    talkToTarget: Math.round((s.plan?.weeklyConversations ?? 0) * 10) / 10,
    partnersTouched: s.partner.conversationsThisWeek,
    leads: 0,
    days,
  }
}
