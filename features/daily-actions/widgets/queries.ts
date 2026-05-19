import { createClient } from '@/lib/supabase/server'
import { getTodayActions } from '../queries'
import { todayISO, summarizeDay, overallPaceStatus, paceStatus } from '../calculations'
import { getStreakData } from '../progress/streaks'
import { getProductionGoals, getFunnelStages } from '@/features/goals/queries'
import { calculateGoalPacing } from '@/features/goals/calculations/engine'
import type {
  TodaySummaryWidgetConfig, DailyActionsListWidgetConfig,
  TodaySummaryWidgetData, DailyActionsListWidgetData,
  DailyMetricPace,
} from '../types'

async function getCurrentUserAndOrg(orgId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  // Sanity check: caller's session matches the org we were given
  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .eq('organization_id', orgId)
    .limit(1)
    .single()
  return membership ? user.id : null
}

export async function getTodaySummaryData(
  _config: TodaySummaryWidgetConfig,
  orgId: string,
): Promise<TodaySummaryWidgetData | null> {
  const userId = await getCurrentUserAndOrg(orgId)
  if (!userId) return null

  const today = todayISO()
  const supabase = await createClient()

  const [actions, goals] = await Promise.all([
    getTodayActions(userId, today),
    getProductionGoals(orgId),
  ])

  // Lightweight per-goal pace status (only for the headline overall_pace).
  const paces: Array<Pick<DailyMetricPace, 'status'>> = []
  for (const goal of goals) {
    if (!goal.target_units || !goal.funnel_id) continue
    const stages = await getFunnelStages(goal.funnel_id)
    if (stages.length === 0) continue
    const final = stages[stages.length - 1]
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
    paces.push({ status: paceStatus(pacing.pace_percent, pacing.target > 0 && pacing.days_elapsed > 0) })
  }

  const summary = summarizeDay(actions, overallPaceStatus(paces), today)
  const streak = await getStreakData(userId, today)
  return { summary, streak }
}

export async function getDailyActionsListData(
  config: DailyActionsListWidgetConfig,
  orgId: string,
): Promise<DailyActionsListWidgetData | null> {
  const userId = await getCurrentUserAndOrg(orgId)
  if (!userId) return null

  const today = todayISO()
  const actions = await getTodayActions(userId, today)
  const filtered = config.show_completed ? actions : actions.filter(a => !a.completed_at)
  const limited = filtered.slice(0, config.max_items ?? 5)
  return { actions: limited, total: filtered.length }
}
