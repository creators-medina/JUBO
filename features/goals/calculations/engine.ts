// Goal Engine — pure calculation layer.
//
// These functions are intentionally generic. They know nothing about
// mortgages, real estate, or any specific industry. They operate on:
//   * a set of stages (ordered by stage_order)
//   * pairwise conversion assumptions (rate from stage A → stage B)
//   * a production goal (target_units, target_volume, target_revenue, timeframe)
//   * the current observed value for the goal metric or for a specific stage
//
// Plug different funnels in and the math still works.

import type {
  FunnelStageRow, ConversionAssumptionRow, ProductionGoalRow,
  GoalMetric, FunnelPaceCadence,
} from '../types'

// ── Time helpers ─────────────────────────────────────────────────────────────

export function daysBetween(startISO: string, endISO: string): number {
  const s = new Date(startISO + 'T00:00:00Z').getTime()
  const e = new Date(endISO + 'T00:00:00Z').getTime()
  const diff = Math.floor((e - s) / 86_400_000)
  return Math.max(1, diff)
}

export function daysElapsed(goal: Pick<ProductionGoalRow, 'start_date' | 'end_date'>, today = new Date()): number {
  const start = new Date(goal.start_date + 'T00:00:00Z').getTime()
  const t = today.getTime()
  const elapsed = Math.floor((t - start) / 86_400_000)
  const total = daysBetween(goal.start_date, goal.end_date)
  return Math.max(0, Math.min(total, elapsed))
}

// ── Conversion math ──────────────────────────────────────────────────────────

/**
 * Multiply pairwise conversion rates along the stage order, from `fromStageId`
 * forward to `toStageId`. Returns 0 if there's a gap (a missing assumption
 * between two adjacent stages on the path).
 *
 * Why pairwise sequential and not "any stage to any stage":
 * - Direct assumptions between non-adjacent stages can still be expressed by
 *   adding a row with the chained rate, but the typical UX is "leads → credit
 *   pull" then "credit pull → preapproval", etc. Sequential makes that easy.
 */
export function chainedConversionRate(
  fromStageId: string,
  toStageId: string,
  stages: FunnelStageRow[],
  assumptions: ConversionAssumptionRow[],
): number {
  if (fromStageId === toStageId) return 1
  const ordered = [...stages].sort((a, b) => a.stage_order - b.stage_order)
  const fromIdx = ordered.findIndex(s => s.id === fromStageId)
  const toIdx   = ordered.findIndex(s => s.id === toStageId)
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) return 0

  let rate = 1
  for (let i = fromIdx; i < toIdx; i++) {
    const cur = ordered[i].id
    const nxt = ordered[i + 1].id
    // Prefer direct pairwise assumption; fall back to any assumption with same
    // funnel_stage_id → target_stage_id that skips ahead (rare).
    const a = assumptions.find(x => x.funnel_stage_id === cur && x.target_stage_id === nxt)
    if (!a) return 0
    rate *= Number(a.conversion_rate)
  }
  return rate
}

/** Return the "outcome" stage — by convention, the highest-stage_order stage. */
export function finalStage(stages: FunnelStageRow[]): FunnelStageRow | null {
  if (stages.length === 0) return null
  return [...stages].sort((a, b) => b.stage_order - a.stage_order)[0]
}

// ── Required stage targets ───────────────────────────────────────────────────

export type RequiredStageTarget = {
  funnel_stage_id: string
  total_required: number
  daily_target:   number
  weekly_target:  number
  monthly_target: number
  yearly_target:  number
}

/**
 * Given a goal (e.g. "150 closings over 365 days"), compute how many units of
 * each upstream stage are required to feed that outcome — using the funnel's
 * conversion assumptions.
 *
 * Returns one row per stage that can be chained to the final stage. Stages
 * without a complete conversion chain are omitted.
 */
export function calculateRequiredStageTargets(
  goal: Pick<ProductionGoalRow, 'start_date' | 'end_date' | 'target_units'>,
  stages: FunnelStageRow[],
  assumptions: ConversionAssumptionRow[],
): RequiredStageTarget[] {
  const final = finalStage(stages)
  if (!final) return []
  const finalTarget = Number(goal.target_units ?? 0)
  if (finalTarget <= 0) return []

  const totalDays = daysBetween(goal.start_date, goal.end_date)
  const out: RequiredStageTarget[] = []

  for (const stage of stages) {
    const rate = chainedConversionRate(stage.id, final.id, stages, assumptions)
    if (rate <= 0) continue
    const totalRequired = finalTarget / rate
    out.push({
      funnel_stage_id: stage.id,
      total_required: totalRequired,
      daily_target:   totalRequired / totalDays,
      weekly_target:  totalRequired / (totalDays / 7),
      monthly_target: totalRequired / (totalDays / 30),
      yearly_target:  totalRequired / (totalDays / 365),
    })
  }

  return out
}

// ── Pacing on the goal headline metric ───────────────────────────────────────

export type GoalPacing = {
  metric: GoalMetric
  target: number
  current: number
  expected_at_now: number
  pace_percent: number       // current / expected_at_now × 100
  progress_percent: number   // current / target × 100
  projected_finish: number   // straight-line extrapolation
  days_total: number
  days_elapsed: number
  days_remaining: number
}

/**
 * Project pacing for the headline metric (units, volume, or revenue).
 *
 * Straight-line: assumes uniform rate over the timeframe. This is the simplest
 * useful baseline; smarter forecasting (weighted by day-of-week, seasonality,
 * etc.) can replace `projected_finish` later without changing the API.
 */
export function calculateGoalPacing(
  goal: Pick<ProductionGoalRow, 'start_date' | 'end_date' | 'target_units' | 'target_volume' | 'target_revenue'>,
  metric: GoalMetric,
  currentValue: number,
  today = new Date(),
): GoalPacing {
  const total = daysBetween(goal.start_date, goal.end_date)
  const elapsed = daysElapsed(goal, today)
  const remaining = Math.max(0, total - elapsed)

  const targetRaw =
    metric === 'units'   ? goal.target_units   :
    metric === 'volume'  ? goal.target_volume  :
                           goal.target_revenue
  const target = Number(targetRaw ?? 0)

  const expectedAtNow = total > 0 ? (elapsed / total) * target : 0
  const pacePercent = expectedAtNow > 0 ? (currentValue / expectedAtNow) * 100 : 0
  const progressPercent = target > 0 ? (currentValue / target) * 100 : 0
  const dailyRun = elapsed > 0 ? currentValue / elapsed : 0
  const projectedFinish = dailyRun * total

  return {
    metric,
    target,
    current: currentValue,
    expected_at_now: expectedAtNow,
    pace_percent: pacePercent,
    progress_percent: progressPercent,
    projected_finish: projectedFinish,
    days_total: total,
    days_elapsed: elapsed,
    days_remaining: remaining,
  }
}

// ── Projection ───────────────────────────────────────────────────────────────

/**
 * Project final performance given current observed value and elapsed time.
 * Pure straight-line forecast.
 */
export function calculateProjectedPerformance(
  goal: Pick<ProductionGoalRow, 'start_date' | 'end_date'>,
  currentValue: number,
  today = new Date(),
): { projected: number; daily_run: number } {
  const total = daysBetween(goal.start_date, goal.end_date)
  const elapsed = daysElapsed(goal, today)
  const dailyRun = elapsed > 0 ? currentValue / elapsed : 0
  return { projected: dailyRun * total, daily_run: dailyRun }
}

// ── Gap analysis per stage ───────────────────────────────────────────────────

export type StageGap = {
  funnel_stage_id: string
  stage_name: string
  expected_so_far: number
  current: number
  gap: number                  // expected_so_far − current; positive = behind
  pace_percent: number
}

/**
 * For each stage, compute "where should we be by now" vs. "where are we" given
 * the goal's final-stage target, the conversion chain, and current per-stage
 * counts. Stages missing from `currentByStageId` are treated as 0.
 */
export function calculateGapToGoal(
  goal: Pick<ProductionGoalRow, 'start_date' | 'end_date' | 'target_units'>,
  stages: FunnelStageRow[],
  assumptions: ConversionAssumptionRow[],
  currentByStageId: Record<string, number>,
  today = new Date(),
): StageGap[] {
  const required = calculateRequiredStageTargets(goal, stages, assumptions)
  if (required.length === 0) return []

  const total   = daysBetween(goal.start_date, goal.end_date)
  const elapsed = daysElapsed(goal, today)
  const fraction = total > 0 ? elapsed / total : 0

  const stageById = new Map(stages.map(s => [s.id, s]))

  return required.map(r => {
    const stage = stageById.get(r.funnel_stage_id)
    const expectedSoFar = r.total_required * fraction
    const current = currentByStageId[r.funnel_stage_id] ?? 0
    const gap = expectedSoFar - current
    const pacePercent = expectedSoFar > 0 ? (current / expectedSoFar) * 100 : 0
    return {
      funnel_stage_id: r.funnel_stage_id,
      stage_name: stage?.name ?? '—',
      expected_so_far: expectedSoFar,
      current,
      gap,
      pace_percent: pacePercent,
    }
  })
}

// ── Cadence helpers ──────────────────────────────────────────────────────────

export function targetForCadence(
  target: RequiredStageTarget,
  cadence: FunnelPaceCadence,
): number {
  return cadence === 'daily'   ? target.daily_target
       : cadence === 'weekly'  ? target.weekly_target
       :                         target.monthly_target
}
