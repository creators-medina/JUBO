import type { WidgetType } from '@/types/database'
import type {
  GoalProgressWidgetConfig, FunnelPaceWidgetConfig, GapAnalysisWidgetConfig,
  GoalProgressData, FunnelPaceData, GapAnalysisData,
} from '@/features/goals/types'
import {
  defaultGoalProgressConfig, defaultFunnelPaceConfig, defaultGapAnalysisConfig,
} from '@/features/goals/types'
import type {
  TodaySummaryWidgetConfig, DailyActionsListWidgetConfig,
  TodaySummaryWidgetData, DailyActionsListWidgetData,
} from '@/features/daily-actions/types'
import {
  defaultTodaySummaryConfig, defaultDailyActionsListConfig,
} from '@/features/daily-actions/types'

export type { WidgetType }
export type {
  GoalProgressWidgetConfig, FunnelPaceWidgetConfig, GapAnalysisWidgetConfig,
  GoalProgressData, FunnelPaceData, GapAnalysisData,
  TodaySummaryWidgetConfig, DailyActionsListWidgetConfig,
  TodaySummaryWidgetData, DailyActionsListWidgetData,
}

// ── Filter primitives ─────────────────────────────────────────────────────────

export type WidgetFilterField = 'status' | 'priority' | 'record_type'
export type WidgetFilterOperator = 'eq' | 'neq'

export type WidgetFilter = {
  field: WidgetFilterField
  operator: WidgetFilterOperator
  value: string
}

// ── Per-type widget configs (stored in dashboard_widgets.config JSONB) ────────

export type MetricWidgetConfig = {
  board_id: string | null
  aggregation: 'count' | 'sum'
  filters: WidgetFilter[]
  icon?: string
  color?: string
  prefix?: string
  suffix?: string
}

export type ListWidgetConfig = {
  board_id: string | null
  filters: WidgetFilter[]
  sort_field: 'created_at' | 'updated_at' | 'title' | 'value' | 'priority'
  sort_direction: 'asc' | 'desc'
  max_records: number
}

export type BoardSummaryWidgetConfig = {
  board_id: string | null
  group_by: 'group' | 'status' | 'priority'
}

export type ActivityFeedWidgetConfig = {
  max_items: number
  activity_types?: string[]
}

export type SavedViewWidgetConfig = {
  saved_view_id: string | null
}

// ── Activity feed data ────────────────────────────────────────────────────────

export type ActivityFeedItem = {
  id: string
  activity_type: string
  record_title: string | null
  user_name: string | null
  content: string | null
  created_at: string
}

export type ActivityFeedData = {
  items: ActivityFeedItem[]
}

// ── Row shapes from DB ────────────────────────────────────────────────────────

export type DashboardRow = {
  id: string
  organization_id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  color: string | null
  is_default: boolean
  is_archived: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SavedViewRow = {
  id: string
  organization_id: string
  board_id: string | null
  name: string
  filters: unknown
  sort: unknown
  visible_fields: unknown
  created_by: string | null
  created_at: string
}

export type DashboardWidgetRow = {
  id: string
  dashboard_id: string
  widget_type: WidgetType
  title: string
  position_x: number
  position_y: number
  width: number   // 1=25% 2=50% 3=75% 4=100% of 12-col grid
  height: number
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── Widget data returned by server queries ────────────────────────────────────

export type MetricWidgetData = {
  value: number
  formatted: string
}

export type ListRecord = {
  id: string
  title: string
  status: string
  priority: string
  value: number | null
  group_name: string | null
  updated_at: string
}

export type ListWidgetData = {
  records: ListRecord[]
  total: number
}

export type BoardSummaryRow = {
  label: string
  count: number
  total_value: number
  color: string | null
  percentage: number
}

export type BoardSummaryData = {
  rows: BoardSummaryRow[]
  grand_total_count: number
  grand_total_value: number
}

// ── Discriminated union for rendered widget data ───────────────────────────────

export type WidgetData =
  | { type: 'metric'; data: MetricWidgetData }
  | { type: 'list'; data: ListWidgetData }
  | { type: 'board_summary'; data: BoardSummaryData }
  | { type: 'activity_feed'; data: ActivityFeedData }
  | { type: 'saved_view'; data: ListWidgetData }
  | { type: 'goal_progress'; data: GoalProgressData }
  | { type: 'funnel_pace'; data: FunnelPaceData }
  | { type: 'gap_analysis'; data: GapAnalysisData }
  | { type: 'today_summary'; data: TodaySummaryWidgetData }
  | { type: 'daily_actions_list'; data: DailyActionsListWidgetData }
  | { type: 'error'; message: string }

// ── Icon names usable in widget configs ───────────────────────────────────────

export type WidgetIconName =
  | 'BarChart2'
  | 'TrendingUp'
  | 'Users'
  | 'DollarSign'
  | 'FileText'
  | 'Activity'
  | 'Target'
  | 'Zap'
  | 'Phone'
  | 'Calendar'
  | 'Star'
  | 'AlertTriangle'

export const WIDGET_ICON_NAMES: WidgetIconName[] = [
  'BarChart2', 'TrendingUp', 'Users', 'DollarSign',
  'FileText', 'Activity', 'Target', 'Zap',
  'Phone', 'Calendar', 'Star', 'AlertTriangle',
]

// ── Color accents usable in metric widgets ────────────────────────────────────

export type WidgetColor = 'blue' | 'green' | 'violet' | 'amber' | 'red' | 'pink'

export const WIDGET_COLORS: Record<WidgetColor, { bg: string; text: string }> = {
  blue:   { bg: 'bg-blue-500/15',   text: 'text-blue-400' },
  green:  { bg: 'bg-emerald-500/15', text: 'text-emerald-400' },
  violet: { bg: 'bg-violet-500/15', text: 'text-violet-400' },
  amber:  { bg: 'bg-amber-500/15',  text: 'text-amber-400' },
  red:    { bg: 'bg-red-500/15',    text: 'text-red-400' },
  pink:   { bg: 'bg-pink-500/15',   text: 'text-pink-400' },
}

// ── Default configs per widget type ──────────────────────────────────────────

export function defaultConfig(type: WidgetType): Record<string, unknown> {
  if (type === 'metric')
    return { board_id: null, aggregation: 'count', filters: [], icon: 'BarChart2', color: 'blue' } satisfies MetricWidgetConfig
  if (type === 'list')
    return { board_id: null, filters: [], sort_field: 'updated_at', sort_direction: 'desc', max_records: 10 } satisfies ListWidgetConfig
  if (type === 'board_summary')
    return { board_id: null, group_by: 'group' } satisfies BoardSummaryWidgetConfig
  if (type === 'activity_feed')
    return { max_items: 10 } satisfies ActivityFeedWidgetConfig
  if (type === 'saved_view')
    return { saved_view_id: null } satisfies SavedViewWidgetConfig
  if (type === 'goal_progress')
    return defaultGoalProgressConfig() as unknown as Record<string, unknown>
  if (type === 'funnel_pace')
    return defaultFunnelPaceConfig() as unknown as Record<string, unknown>
  if (type === 'gap_analysis')
    return defaultGapAnalysisConfig() as unknown as Record<string, unknown>
  if (type === 'today_summary')
    return defaultTodaySummaryConfig() as unknown as Record<string, unknown>
  if (type === 'daily_actions_list')
    return defaultDailyActionsListConfig() as unknown as Record<string, unknown>
  return {}
}
