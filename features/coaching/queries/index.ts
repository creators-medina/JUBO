// ─────────────────────────────────────────────────────────────────────────
// Coaching queries — assemble the live CoachingSnapshot from existing data
// (production goals, communication_logs talk-tos, partner records). Server-side,
// org+user scoped via RLS. All business math is delegated to ../calculations.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { isConnect } from '@/features/communications/outcomes'
import { getProductionGoals, getFunnelStages } from '@/features/goals/queries'
import { resolveBaselines } from '../calculations/baselines'
import { reverseEngineerPlan, inferIncomeGoal } from '../calculations/engine'
import { buildPartnerHealth, aggregatePartnerMetrics } from '../calculations/partner-math'
import { buildForecast } from '../calculations/forecasting'
import { calculateExecutionScore } from '../calculations/execution-score'
import { generateCoachInsights } from '../calculations/recommendations'
import type {
  Baselines, CoachingAssumptionsRow, CoachingSnapshot, Forecast, PartnerHealth, ReverseEngineeredPlan,
} from '../types'

function startOfTodayISO(): string { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString() }
function startOfWeekISO(): string { const d = new Date(); const diff = (d.getDay() + 6) % 7; d.setDate(d.getDate() - diff); d.setHours(0, 0, 0, 0); return d.toISOString() }
function daysBetween(a: string, b: string): number { return Math.max(0, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000)) }

type SB = Awaited<ReturnType<typeof createClient>>

export async function getResolvedBaselines(organizationId: string, userId: string): Promise<Baselines> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('coaching_assumptions')
    .select('*')
    .eq('organization_id', organizationId)
  const rows = (data as CoachingAssumptionsRow[] | null) ?? []
  const orgRow = rows.find((r) => r.user_id == null) ?? null
  const userRow = rows.find((r) => r.user_id === userId) ?? null
  return resolveBaselines(orgRow, userRow)
}

/** Talk-tos = real conversations: call logs whose outcome is a connect. */
async function countTalkTos(supabase: SB, organizationId: string, userId: string, sinceISO: string, recordIds?: string[]): Promise<number> {
  let q = supabase
    .from('communication_logs')
    .select('outcome, record_id, channel')
    .eq('organization_id', organizationId)
    .eq('created_by', userId)
    .eq('channel', 'call')
    .gte('occurred_at', sinceISO)
  if (recordIds && recordIds.length > 0) q = q.in('record_id', recordIds)
  const { data } = await q
  return ((data as { outcome: string | null }[] | null) ?? []).filter((l) => isConnect(l.outcome)).length
}

async function getPartnerHealth(supabase: SB, organizationId: string, baselines: Baselines): Promise<PartnerHealth[]> {
  // Partner records: realtor/partner boards or referral record-type.
  const { data: boards } = await supabase
    .from('boards').select('id, slug').eq('organization_id', organizationId)
  const partnerBoardIds = ((boards as { id: string; slug: string | null }[] | null) ?? [])
    .filter((b) => (b.slug ?? '').match(/partner|realtor|referral/i))
    .map((b) => b.id)

  let rq = supabase
    .from('records')
    .select('id, title, board_id, record_type')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .limit(200)
  if (partnerBoardIds.length > 0) {
    rq = rq.or(`board_id.in.(${partnerBoardIds.join(',')}),record_type.eq.referral`)
  } else {
    rq = rq.eq('record_type', 'referral')
  }
  const { data: recs } = await rq
  const records = (recs as { id: string; title: string; board_id: string | null }[] | null) ?? []
  if (records.length === 0) return []

  const ids = records.map((r) => r.id)
  // Last contact per partner (any non-internal channel).
  const { data: logs } = await supabase
    .from('communication_logs')
    .select('record_id, occurred_at')
    .in('record_id', ids)
    .neq('channel', 'internal')
    .order('occurred_at', { ascending: false })
  const lastContact = new Map<string, string>()
  for (const l of (logs as { record_id: string; occurred_at: string }[] | null) ?? []) {
    if (!lastContact.has(l.record_id)) lastContact.set(l.record_id, l.occurred_at)
  }
  const now = Date.now()
  return records.map((r) => {
    const lc = lastContact.get(r.id)
    const daysSinceContact = lc ? Math.floor((now - new Date(lc).getTime()) / 86400000) : null
    return buildPartnerHealth(
      { recordId: r.id, name: r.title, boardId: r.board_id, daysSinceContact, leadsYtd: 0, conversationsYtd: 0, fundedYtd: 0 },
      baselines,
    )
  })
}

export async function getCoachingSnapshot(organizationId: string, userId: string): Promise<CoachingSnapshot> {
  const supabase = await createClient()
  const baselines = await getResolvedBaselines(organizationId, userId)

  const todayStart = startOfTodayISO()
  const weekStart = startOfWeekISO()

  // Income goal + period from the first active production goal.
  const goals = await getProductionGoals(organizationId)
  const goal = goals[0] ?? null
  const incomeGoal = inferIncomeGoal(goal, baselines)
  const plan: ReverseEngineeredPlan | null = incomeGoal ? reverseEngineerPlan(incomeGoal, baselines) : null

  // Closings YTD = records in the goal's final funnel-stage group since goal start.
  let closingsYtd = 0
  let daysElapsed = 1
  let daysInPeriod = 365
  if (goal?.funnel_id && goal.start_date) {
    daysElapsed = Math.max(1, daysBetween(goal.start_date, new Date().toISOString()))
    if (goal.end_date) daysInPeriod = Math.max(daysElapsed, daysBetween(goal.start_date, goal.end_date))
    const stages = await getFunnelStages(goal.funnel_id)
    const final = stages[stages.length - 1]
    if (final?.board_group_id) {
      const { count } = await supabase
        .from('records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('group_id', final.board_group_id)
        .eq('is_archived', false)
        .gte('created_at', goal.start_date)
      closingsYtd = count ?? 0
    }
  }

  // Talk-tos (real conversations).
  const [talkTosToday, talkTosThisWeek] = await Promise.all([
    countTalkTos(supabase, organizationId, userId, todayStart),
    countTalkTos(supabase, organizationId, userId, weekStart),
  ])

  // Partner intelligence.
  const partnerHealth = await getPartnerHealth(supabase, organizationId, baselines)
  const partnerIds = partnerHealth.map((p) => p.recordId)
  const partnerConversationsThisWeek = partnerIds.length > 0
    ? await countTalkTos(supabase, organizationId, userId, weekStart, partnerIds)
    : 0
  const partner = aggregatePartnerMetrics(partnerHealth, plan, partnerConversationsThisWeek, baselines)

  // Forecasts (dynamic projection to period end).
  const forecasts: Forecast[] = []
  if (plan) {
    forecasts.push(buildForecast({ metric: 'closings', label: 'Closings', current: closingsYtd, target: plan.closingTarget, daysElapsed, daysInPeriod }))
    forecasts.push(buildForecast({ metric: 'income', label: 'Income', current: closingsYtd * baselines.avgCommission, target: plan.incomeGoal, daysElapsed, daysInPeriod }))
    const dayOfWeek = ((new Date().getDay() + 6) % 7) + 1
    forecasts.push(buildForecast({ metric: 'talk_tos', label: 'Talk-tos', current: talkTosThisWeek, target: plan.weeklyConversations, daysElapsed: dayOfWeek, daysInPeriod: 7 }))
  }

  // Goal pacing % for the execution score (closings vs expected-by-now).
  const expectedClosings = plan ? plan.closingTarget * (daysElapsed / daysInPeriod) : 0
  const pacePercent = expectedClosings > 0 ? (closingsYtd / expectedClosings) * 100 : (plan ? 0 : 100)

  // Open / overdue actions (for follow-up discipline factor).
  const nowISO = new Date().toISOString()
  const [{ count: openActions }, { count: overdueActions }] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('completed_at', null),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).is('completed_at', null).lt('due_date', nowISO),
  ])

  const execution = calculateExecutionScore({
    talkTosThisWeek,
    talkToWeeklyTarget: plan?.weeklyConversations ?? 0,
    overdueActions: overdueActions ?? 0,
    openActions: openActions ?? 0,
    stalePartners: partner.coolingOffPartners + partner.atRiskPartners,
    totalPartners: partner.totalPartners,
    prospectingStreakDays: 0,
    pacePercent,
  })

  return {
    baselines,
    plan,
    talkTosToday,
    talkTosThisWeek,
    closingsYtd,
    daysElapsed,
    daysInPeriod,
    partner,
    execution,
    forecasts,
    variances: [],
  }
}

/** Coach insights for Today + recaps. */
export async function getCoachInsights(organizationId: string, userId: string) {
  const s = await getCoachingSnapshot(organizationId, userId)
  return generateCoachInsights({
    plan: s.plan, partner: s.partner, forecasts: s.forecasts,
    execution: s.execution, talkTosThisWeek: s.talkTosThisWeek, variances: s.variances,
  })
}
