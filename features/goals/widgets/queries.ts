import { createClient } from '@/lib/supabase/server'
import {
  calculateGoalPacing, calculateRequiredStageTargets, calculateGapToGoal,
  targetForCadence,
} from '../calculations/engine'
import { getFunnelStages, getConversionAssumptions, getProductionGoal } from '../queries'
import type {
  GoalProgressWidgetConfig, FunnelPaceWidgetConfig, GapAnalysisWidgetConfig,
  GoalProgressData, FunnelPaceData, GapAnalysisData,
} from '../types'

// ── Performance probes ──────────────────────────────────────────────────────
//
// These are the bridge from the abstract funnel model to actual data. They use
// `funnel_stages.board_group_id` if set; otherwise the stage contributes zero
// to current performance (math still works — pacing/required targets show, and
// the user knows to wire that stage up to a board group).

async function currentCountForStage(
  organizationId: string,
  boardGroupId: string | null,
  startDate: string,
): Promise<number> {
  if (!boardGroupId) return 0
  const supabase = await createClient()
  const { count } = await supabase
    .from('records')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('group_id', boardGroupId)
    .eq('is_archived', false)
    .gte('created_at', startDate)
  return count ?? 0
}

async function currentValueSumForStage(
  organizationId: string,
  boardGroupId: string | null,
  startDate: string,
): Promise<number> {
  if (!boardGroupId) return 0
  const supabase = await createClient()
  const { data } = await supabase
    .from('records')
    .select('value')
    .eq('organization_id', organizationId)
    .eq('group_id', boardGroupId)
    .eq('is_archived', false)
    .gte('created_at', startDate)
  return (data ?? []).reduce((sum, r) => sum + Number(r.value ?? 0), 0)
}

// ── Widget data builders ────────────────────────────────────────────────────

export async function getGoalProgressData(
  config: GoalProgressWidgetConfig,
  orgId: string,
): Promise<GoalProgressData | null> {
  if (!config.production_goal_id) return null
  const goal = await getProductionGoal(config.production_goal_id)
  if (!goal || goal.organization_id !== orgId) return null

  // Headline metric current value comes from the funnel's final stage.
  let current = 0
  if (goal.funnel_id) {
    const stages = await getFunnelStages(goal.funnel_id)
    if (stages.length > 0) {
      const final = stages[stages.length - 1]
      current = config.metric === 'units'
        ? await currentCountForStage(orgId, final.board_group_id, goal.start_date)
        : await currentValueSumForStage(orgId, final.board_group_id, goal.start_date)
    }
  }

  const pacing = calculateGoalPacing(goal, config.metric, current)

  return {
    goal_name: goal.name,
    metric: config.metric,
    display: config.display,
    target: pacing.target,
    current: pacing.current,
    expected_at_now: pacing.expected_at_now,
    pace_percent: pacing.pace_percent,
    progress_percent: pacing.progress_percent,
    projected_finish: pacing.projected_finish,
    days_total: pacing.days_total,
    days_elapsed: pacing.days_elapsed,
    days_remaining: pacing.days_remaining,
  }
}

export async function getFunnelPaceData(
  config: FunnelPaceWidgetConfig,
  orgId: string,
): Promise<FunnelPaceData | null> {
  if (!config.production_goal_id) return null
  const goal = await getProductionGoal(config.production_goal_id)
  if (!goal || goal.organization_id !== orgId || !goal.funnel_id) return null

  const stages = await getFunnelStages(goal.funnel_id)
  const assumptions = await getConversionAssumptions(orgId, goal.funnel_id)
  const required = calculateRequiredStageTargets(goal, stages, assumptions)

  const idFilter = config.stage_ids && config.stage_ids.length > 0
    ? new Set(config.stage_ids)
    : null

  const rows = required
    .filter(r => idFilter ? idFilter.has(r.funnel_stage_id) : true)
    .map(r => {
      const stage = stages.find(s => s.id === r.funnel_stage_id)!
      return {
        stage_id: r.funnel_stage_id,
        stage_name: stage.name,
        stage_slug: stage.slug,
        cadence_target: targetForCadence(r, config.cadence),
        total_required: r.total_required,
      }
    })

  return { goal_name: goal.name, cadence: config.cadence, rows }
}

export async function getGapAnalysisData(
  config: GapAnalysisWidgetConfig,
  orgId: string,
): Promise<GapAnalysisData | null> {
  if (!config.production_goal_id) return null
  const goal = await getProductionGoal(config.production_goal_id)
  if (!goal || goal.organization_id !== orgId || !goal.funnel_id) return null

  const stages = await getFunnelStages(goal.funnel_id)
  const assumptions = await getConversionAssumptions(orgId, goal.funnel_id)

  // Pull current count per stage (units; volume/revenue gaps come later).
  const currentByStageId: Record<string, number> = {}
  await Promise.all(stages.map(async s => {
    currentByStageId[s.id] = await currentCountForStage(orgId, s.board_group_id, goal.start_date)
  }))

  const gaps = calculateGapToGoal(goal, stages, assumptions, currentByStageId)

  return {
    goal_name: goal.name,
    cadence: config.cadence,
    rows: gaps.map(g => ({
      stage_id: g.funnel_stage_id,
      stage_name: g.stage_name,
      expected_so_far: g.expected_so_far,
      current: g.current,
      gap: g.gap,
      pace_percent: g.pace_percent,
    })),
  }
}
