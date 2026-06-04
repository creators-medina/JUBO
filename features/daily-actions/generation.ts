'use server'

import { revalidatePath } from 'next/cache'

// Daily action generation engine.
//
// Strategy: idempotent generation. The DB has partial UNIQUE indexes on
// (user_id, due_date, task_id) and (user_id, due_date, production_goal_id) for
// source='goal_pacing', so running generation multiple times in the same day
// updates rather than duplicates.
//
// Sources (Phase 9, minimum acceptable):
//   1. Open tasks due today / overdue → 'task' source
//   2. Production goals where today's pace is behind → 'goal_pacing' source
//
// Reusable later by AI, automations, cron jobs, mobile.

import { createClient } from '@/lib/supabase/server'
import { calculateGoalPacing, daysBetween, daysElapsed } from '@/features/goals/calculations/engine'
import { getProductionGoals, getFunnelStages } from '@/features/goals/queries'
import { resolveProducerUserId } from '@/features/auth/guards'
import { todayISO } from './calculations'

type GenerateInput = {
  organizationId: string
  userId: string
  date?: string
}

export type GenerationReport = {
  taskActions: number
  pacingActions: number
  total: number
}

export async function generateDailyActionsForUser({
  organizationId, userId, date,
}: GenerateInput): Promise<GenerationReport> {
  const supabase = await createClient()
  const today = date ?? todayISO()

  const report: GenerationReport = { taskActions: 0, pacingActions: 0, total: 0 }

  // ── 1. Open tasks due today or overdue ──────────────────────────────────
  const tomorrow = new Date(today + 'T00:00:00Z')
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, description, priority, due_date, record_id')
    .eq('organization_id', organizationId)
    .eq('assigned_user_id', userId)
    .is('completed_at', null)
    .lt('due_date', tomorrow.toISOString())

  for (const t of tasks ?? []) {
    const { error } = await supabase.rpc('upsert_generated_daily_action', {
      p_organization_id: organizationId,
      p_user_id: userId,
      p_title: t.title,
      p_description: t.description,
      p_priority: t.priority,
      p_due_date: today,
      p_action_type: 'task',
      p_source: 'task',
      p_production_goal_id: null,
      p_record_id: t.record_id,
      p_task_id: t.id,
      p_metadata: { task_due_date: t.due_date },
    })
    if (!error) report.taskActions += 1
  }

  // ── 2. Behind-pace production goals → review action ─────────────────────
  // Phase 33B — only the producer's own goals (legacy org-wide for support/unknown).
  const producerId = await resolveProducerUserId(organizationId, userId, supabase)
  const goals = await getProductionGoals(organizationId, producerId)
  for (const goal of goals) {
    if (!goal.funnel_id) continue

    const stages = await getFunnelStages(goal.funnel_id)
    if (stages.length === 0) continue

    // Use unit target as the headline metric for the suggestion.
    if (!goal.target_units) continue

    // Current observed units: count records in the final stage's board_group_id
    // since goal.start_date. If no group mapping, skip (we can't be honest about pace).
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
    if (pacing.pace_percent >= 90) continue   // on/ahead pace — no nudge

    const totalDays   = daysBetween(goal.start_date, goal.end_date)
    const elapsedDays = daysElapsed(goal)
    const remaining   = Math.max(1, totalDays - elapsedDays)
    const gap         = Math.max(0, pacing.expected_at_now - current)
    const dailyCatchUp = Math.ceil((Number(goal.target_units) - current) / remaining)

    const title = `Catch up on ${goal.name}`
    const description =
      gap > 0
        ? `Behind by ${Math.ceil(gap)} ${pacing.metric}. ` +
          `Need ~${dailyCatchUp}/day for ${remaining} more days to hit target.`
        : `Below pace — ~${dailyCatchUp}/day needed to stay on track.`

    const { error } = await supabase.rpc('upsert_generated_daily_action', {
      p_organization_id: organizationId,
      p_user_id: userId,
      p_title: title,
      p_description: description,
      p_priority: pacing.pace_percent < 70 ? 'high' : 'medium',
      p_due_date: today,
      p_action_type: 'review',
      p_source: 'goal_pacing',
      p_production_goal_id: goal.id,
      p_record_id: null,
      p_task_id: null,
      p_metadata: { pace_percent: pacing.pace_percent, expected_at_now: pacing.expected_at_now, current },
    })
    if (!error) report.pacingActions += 1
  }

  report.total = report.taskActions + report.pacingActions
  return report
}

/**
 * User-facing regenerate trigger. Re-runs generation for the current user/org
 * (idempotent via the partial UNIQUE indexes on daily_actions).
 */
export async function regenerateDailyActions(organizationId: string): Promise<GenerationReport> {
  const { createClient } = await import('@/lib/supabase/server')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const report = await generateDailyActionsForUser({ organizationId, userId: user.id })
  revalidatePath('/today')
  return report
}
