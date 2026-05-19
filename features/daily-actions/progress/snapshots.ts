'use server'

// Daily-progress snapshot writer.
//
// Captures per-user per-day metrics into the daily_progress table. Idempotent —
// the underlying upsert_daily_progress RPC keys on (user_id, date, production_goal_id, metric_key)
// so calling this repeatedly during a single day just updates the same row.
//
// Called on:
//   * complete / reopen daily_action
//   * /today page load
//   * goal-pace recompute (Phase 11 trigger)

import { createClient } from '@/lib/supabase/server'
import { getTodayActions } from '../queries'
import { todayISO } from '../calculations'
import { getProductionGoals, getFunnelStages } from '@/features/goals/queries'
import { calculateGoalPacing } from '@/features/goals/calculations/engine'

export type SnapshotMetrics = {
  actions_target:    number
  actions_completed: number
  overdue_actions:   number
  completed_tasks:   number
  activities_logged: number
  created_records:   number
}

type RpcArgs = {
  p_organization_id:    string
  p_production_goal_id: string | null
  p_date:               string
  p_metric_key:         string
  p_target_value:       number | null
  p_actual_value:       number
  p_status:             string
  p_metadata:           Record<string, unknown>
}

/**
 * Capture today's snapshot for a user. Safe to call any time; writes are
 * upserts keyed on (user, date, goal_id, metric_key).
 *
 * Returns the metrics that were written so callers can avoid double-fetching.
 */
export async function snapshotDailyProgress(input: {
  organizationId: string
  userId: string
  date?: string
}): Promise<SnapshotMetrics> {
  const supabase = await createClient()
  const date = input.date ?? todayISO()
  const { organizationId, userId } = input

  // ── Pull the inputs we need to compute metrics ──────────────────────────
  const actions = await getTodayActions(userId, date)

  // Tasks completed today (independent of daily_actions in case the user
  // completed a task elsewhere)
  const startISO = `${date}T00:00:00Z`
  const endISO = `${date}T23:59:59.999Z`

  const [tasksRes, activitiesRes, recordsRes] = await Promise.all([
    supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('assigned_user_id', userId)
      .gte('completed_at', startISO)
      .lte('completed_at', endISO),
    supabase
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
    supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('created_by', userId)
      .gte('created_at', startISO)
      .lte('created_at', endISO),
  ])

  // ── Compute summary ─────────────────────────────────────────────────────
  const dueOrCompletedToday = actions.filter(a => a.due_date <= date)
  const completed = dueOrCompletedToday.filter(a => a.completed_at !== null).length
  const total     = dueOrCompletedToday.length
  const overdue   = actions.filter(a => !a.completed_at && a.due_date < date).length

  const metrics: SnapshotMetrics = {
    actions_target:    total,
    actions_completed: completed,
    overdue_actions:   overdue,
    completed_tasks:   tasksRes.count ?? 0,
    activities_logged: activitiesRes.count ?? 0,
    created_records:   recordsRes.count ?? 0,
  }

  const completionPct = total > 0 ? completed / total : 0
  const overallStatus =
    overdue > 0 || (total > 0 && completionPct < 0.5) ? 'behind' :
    total === 0 ? 'unknown' :
    completionPct >= 0.8 ? 'ahead' :
    'on_pace'

  // ── Write one row per metric_key (no goal binding) ──────────────────────
  const baseCalls: RpcArgs[] = [
    rpc(organizationId, null, date, 'actions_target',    metrics.actions_target, 'unknown'),
    rpc(organizationId, null, date, 'actions_completed', metrics.actions_completed, overallStatus),
    rpc(organizationId, null, date, 'overdue_actions',   metrics.overdue_actions, overdue > 0 ? 'behind' : 'on_pace'),
    rpc(organizationId, null, date, 'completed_tasks',   metrics.completed_tasks, 'unknown'),
    rpc(organizationId, null, date, 'activities_logged', metrics.activities_logged, 'unknown'),
    rpc(organizationId, null, date, 'created_records',   metrics.created_records, 'unknown'),
  ]
  baseCalls[0].p_target_value = total
  baseCalls[1].p_target_value = total
  baseCalls[1].p_metadata = { completion_pct: completionPct }

  // ── Goal-pace snapshots (one per goal with a funnel + group mapping) ────
  const goals = await getProductionGoals(organizationId)
  const goalCalls: RpcArgs[] = []
  for (const goal of goals) {
    if (!goal.target_units || !goal.funnel_id) continue
    const stages = await getFunnelStages(goal.funnel_id)
    if (stages.length === 0) continue
    const final = stages[stages.length - 1]
    if (!final.board_group_id) continue

    const { count } = await supabase
      .from('records')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('group_id', final.board_group_id)
      .eq('is_archived', false)
      .gte('created_at', goal.start_date)
    const current = count ?? 0

    const pacing = calculateGoalPacing(goal, 'units', current)
    const hasData = pacing.target > 0 && pacing.days_elapsed > 0
    const status = !hasData ? 'unknown' :
                   pacing.pace_percent >= 110 ? 'ahead' :
                   pacing.pace_percent >= 90  ? 'on_pace' :
                                                'behind'

    goalCalls.push({
      ...rpc(organizationId, goal.id, date, 'goal_pace_percent', Math.round(pacing.pace_percent * 100) / 100, status),
      p_target_value: 100,
      p_metadata: { current, expected: pacing.expected_at_now, target: pacing.target },
    })
  }

  // Fire all upserts in parallel
  await Promise.all([...baseCalls, ...goalCalls].map(async (args) => {
    const { error } = await supabase.rpc('upsert_daily_progress', args)
    if (error) {
      // Best-effort — don't throw; one bad row shouldn't break the page
      console.warn('upsert_daily_progress failed:', args.p_metric_key, error.message)
    }
  }))

  return metrics
}

function rpc(
  orgId: string,
  goalId: string | null,
  date: string,
  metricKey: string,
  actual: number,
  status: string,
): RpcArgs {
  return {
    p_organization_id:    orgId,
    p_production_goal_id: goalId,
    p_date:               date,
    p_metric_key:         metricKey,
    p_target_value:       null,
    p_actual_value:       actual,
    p_status:             status,
    p_metadata:           {},
  }
}
