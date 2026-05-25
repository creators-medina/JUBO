import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { generateDailyActionsForUser } from '@/features/daily-actions/generation'
import { getTodayActions, getStaleRecords } from '@/features/daily-actions/queries'
import {
  todayISO, summarizeDay, overallPaceStatus, paceStatus,
} from '@/features/daily-actions/calculations'
import { snapshotDailyProgress } from '@/features/daily-actions/progress/snapshots'
import { getStreakData } from '@/features/daily-actions/progress/streaks'
import { getAttentionViewsWithCounts } from '@/features/daily-actions/attention/queries'
import { runWorkflowScans } from '@/features/workflows/triggers/scan'
import { getProductionGoals, getFunnelStages, getConversionAssumptions, getGoalTargets } from '@/features/goals/queries'
import {
  calculateGoalPacing, calculateRequiredStageTargets,
} from '@/features/goals/calculations/engine'
import { TodayPageClient } from '@/features/daily-actions/components/TodayPageClient'
import { getSetupChecklist } from '@/features/onboarding/queries'
import type { DailyMetricPace } from '@/features/daily-actions/types'

export const dynamic = 'force-dynamic'

export default async function TodayPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, organizations(id, name)')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const orgName = (membership as { organizations?: { name?: string } | null }).organizations?.name ?? 'Organization'

  const today = todayISO()

  // Drain any pending integration events (async runtime) + run scheduled jobs
  // (stale scans, preapproval expiration) in this authenticated session. The
  // worker is idempotent and only touches pending work, so this is cheap.
  try {
    const { runIntegrationWorker } = await import('@/features/integrations/runtime/worker')
    const { runScheduledJobs } = await import('@/features/integrations/runtime/scheduler')
    const ctx = { organizationId: orgId, userId: user.id, source: 'scheduler' as const }
    await runIntegrationWorker(supabase as never, ctx, { limit: 25 })
    await runScheduledJobs(supabase as never, ctx)
  } catch { /* silent — runtime is best-effort */ }

  // Run workflow scans (throttled to ~30min) so stale/overdue records surface
  // attention before we generate the day's actions. Best-effort.
  try {
    await runWorkflowScans(orgId, { throttleMinutes: 30 })
  } catch { /* silent */ }

  // Generate (idempotent — partial UNIQUE indexes guard against duplicates).
  try {
    await generateDailyActionsForUser({ organizationId: orgId, userId: user.id })
  } catch { /* silent — generation is best-effort */ }

  // Snapshot today's progress before reading streak history (so today's row exists)
  try {
    await snapshotDailyProgress({ organizationId: orgId, userId: user.id })
  } catch { /* silent */ }

  // Fetch in parallel: actions, goals, stale records, attention views
  const [actions, goals, staleRecords, attentionViews] = await Promise.all([
    getTodayActions(user.id, today),
    getProductionGoals(orgId),
    getStaleRecords(orgId, 14, 6),
    getAttentionViewsWithCounts(orgId),
  ])

  // Build per-goal pacing for the right column
  const paces: DailyMetricPace[] = []
  for (const goal of goals) {
    if (!goal.target_units || !goal.funnel_id) continue
    const [stages, assumptions, targets] = await Promise.all([
      getFunnelStages(goal.funnel_id),
      getConversionAssumptions(orgId, goal.funnel_id),
      getGoalTargets(goal.id),
    ])
    if (stages.length === 0) continue
    const final = stages[stages.length - 1]

    // Current units = count of records in the final stage's board group since start.
    let current = 0
    if (final.board_group_id) {
      const { count } = await supabase
        .from('records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('group_id', final.board_group_id)
        .eq('is_archived', false)
        .gte('created_at', goal.start_date)
      current = count ?? 0
    }

    const pacing = calculateGoalPacing(goal, 'units', current)

    // Resolve daily/weekly/monthly targets — prefer cached goal_targets for the final stage
    const cached = targets.find(t => t.funnel_stage_id === final.id)
    let daily = 0, weekly = 0, monthly = 0
    if (cached?.daily_target != null) {
      daily   = Number(cached.daily_target)
      weekly  = Number(cached.weekly_target ?? 0)
      monthly = Number(cached.monthly_target ?? 0)
    } else {
      const live = calculateRequiredStageTargets(goal, stages, assumptions)
          .find(r => r.funnel_stage_id === final.id)
      if (live) {
        daily   = live.daily_target
        weekly  = live.weekly_target
        monthly = live.monthly_target
      }
    }

    paces.push({
      production_goal_id: goal.id,
      goal_name: goal.name,
      metric_key: 'units',
      metric_label: 'Units',
      daily_target: daily,
      weekly_target: weekly,
      monthly_target: monthly,
      current,
      todayCount: 0,
      expected_at_now: pacing.expected_at_now,
      pace_percent: pacing.pace_percent,
      status: paceStatus(pacing.pace_percent, pacing.target > 0 && pacing.days_elapsed > 0),
    })
  }

  const summary = summarizeDay(actions, overallPaceStatus(paces), today)

  // Build record_id → board_id lookup for "open record" links
  const recordIds = [...new Set(actions.map(a => a.record_id).filter(Boolean) as string[])]
  let recordBoardMap: Record<string, string> = {}
  if (recordIds.length > 0) {
    const { data: recs } = await supabase
      .from('records')
      .select('id, board_id')
      .in('id', recordIds)
    recordBoardMap = Object.fromEntries((recs ?? []).map((r: { id: string; board_id: string }) => [r.id, r.board_id]))
  }

  const streak = await getStreakData(user.id, today)
  const setupChecklist = await getSetupChecklist(orgId)

  return (
    <TodayPageClient
      organizationId={orgId}
      organizationName={orgName}
      todayISO={today}
      actions={actions}
      summary={summary}
      paces={paces}
      staleRecords={staleRecords}
      attentionViews={attentionViews}
      streak={streak}
      productionGoals={goals.map(g => ({ id: g.id, name: g.name }))}
      recordBoardMap={recordBoardMap}
      lastUpdatedAt={new Date().toISOString()}
      setupChecklist={setupChecklist}
    />
  )
}
