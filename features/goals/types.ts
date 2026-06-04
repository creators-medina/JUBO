import type { GoalTimeframe } from '@/types/database'

export type { GoalTimeframe }

// ── Row shapes ───────────────────────────────────────────────────────────────

export type FunnelRow = {
  id: string
  organization_id: string
  name: string
  description: string | null
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type FunnelStageRow = {
  id: string
  funnel_id: string
  name: string
  slug: string
  stage_order: number
  stage_type: string         // free-form: 'activity' | 'qualification' | 'outcome' | etc.
  board_group_id: string | null
  created_at: string
}

export type ConversionAssumptionRow = {
  id: string
  organization_id: string
  funnel_stage_id: string
  target_stage_id: string
  conversion_rate: number    // 0..1
  timeframe: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProductionGoalRow = {
  id: string
  organization_id: string
  funnel_id: string | null
  name: string
  timeframe: GoalTimeframe | string
  start_date: string         // ISO date (YYYY-MM-DD)
  end_date: string
  target_units: number | null
  target_volume: number | null
  target_revenue: number | null
  is_archived: boolean
  created_by: string | null
  producer_user_id: string | null
  created_at: string
  updated_at: string
}

export type GoalTargetRow = {
  id: string
  production_goal_id: string
  funnel_stage_id: string
  daily_target: number | null
  weekly_target: number | null
  monthly_target: number | null
  yearly_target: number | null
  created_at: string
}

// ── Goal-widget configs (stored in dashboard_widgets.config JSONB) ───────────

export type GoalMetric = 'units' | 'volume' | 'revenue'

export type GoalProgressWidgetConfig = {
  production_goal_id: string | null
  metric: GoalMetric
  display: 'bar' | 'radial' | 'compact'
}

export type FunnelPaceCadence = 'daily' | 'weekly' | 'monthly'

export type FunnelPaceWidgetConfig = {
  production_goal_id: string | null
  cadence: FunnelPaceCadence
  stage_ids?: string[] | null   // null/empty = all stages
}

export type GapAnalysisWidgetConfig = {
  production_goal_id: string | null
  cadence: FunnelPaceCadence
}

// ── Widget data shapes ───────────────────────────────────────────────────────

export type GoalProgressData = {
  goal_name: string
  metric: GoalMetric
  display: 'bar' | 'radial' | 'compact'
  target: number
  current: number
  expected_at_now: number
  pace_percent: number          // >100 ahead, <100 behind
  progress_percent: number
  projected_finish: number
  days_total: number
  days_elapsed: number
  days_remaining: number
}

export type FunnelPaceRow = {
  stage_id: string
  stage_name: string
  stage_slug: string
  cadence_target: number
  total_required: number
}

export type FunnelPaceData = {
  goal_name: string
  cadence: FunnelPaceCadence
  rows: FunnelPaceRow[]
}

export type GapRow = {
  stage_id: string
  stage_name: string
  expected_so_far: number
  current: number
  gap: number                    // expected − current (positive = behind)
  pace_percent: number
}

export type GapAnalysisData = {
  goal_name: string
  cadence: FunnelPaceCadence
  rows: GapRow[]
}

// ── Default configs ──────────────────────────────────────────────────────────

export function defaultGoalProgressConfig(): GoalProgressWidgetConfig {
  return { production_goal_id: null, metric: 'units', display: 'bar' }
}

export function defaultFunnelPaceConfig(): FunnelPaceWidgetConfig {
  return { production_goal_id: null, cadence: 'daily', stage_ids: null }
}

export function defaultGapAnalysisConfig(): GapAnalysisWidgetConfig {
  return { production_goal_id: null, cadence: 'weekly' }
}
