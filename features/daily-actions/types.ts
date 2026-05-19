import type { TaskPriority, DailyActionSource, DailyProgressStatus } from '@/types/database'

export type { TaskPriority, DailyActionSource, DailyProgressStatus }

// ── Row shapes ───────────────────────────────────────────────────────────────

export type DailyActionRow = {
  id: string
  organization_id: string
  user_id: string
  production_goal_id: string | null
  record_id: string | null
  task_id: string | null
  action_type: string
  title: string
  description: string | null
  priority: TaskPriority
  due_date: string             // YYYY-MM-DD
  completed_at: string | null
  source: DailyActionSource | string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type DailyProgressRow = {
  id: string
  organization_id: string
  user_id: string
  production_goal_id: string | null
  date: string
  metric_key: string
  target_value: number | null
  actual_value: number
  status: DailyProgressStatus | string
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

// ── UI bucket grouping ───────────────────────────────────────────────────────

export type ActionBucket = 'urgent' | 'today' | 'later'

export const PRIORITY_RANK: Record<string, number> = {
  urgent: 0,
  high:   1,
  medium: 2,
  low:    3,
  none:   4,
}

export function actionBucket(action: DailyActionRow, todayISO: string): ActionBucket {
  if (action.priority === 'urgent' || action.priority === 'high') return 'urgent'
  if (action.due_date <= todayISO) return 'today'
  return 'later'
}

// ── Daily pacing per goal/metric (derived, not stored) ───────────────────────

export type DailyMetricPace = {
  production_goal_id: string
  goal_name: string
  metric_key: string                  // 'units' | 'volume' | 'revenue' | stage slug
  metric_label: string
  daily_target: number
  weekly_target: number
  monthly_target: number
  current: number                     // total observed across the goal window
  todayCount: number                  // observed today (may be 0 — informational)
  expected_at_now: number
  pace_percent: number
  status: DailyProgressStatus
}

export type TodaySummary = {
  date: string
  total: number
  completed: number
  open: number
  overdue: number
  paceStatus: DailyProgressStatus    // overall summary status
  paceLabel: string                  // short sentence: "On pace" / "Behind pace" / etc.
}

// ── Widget configs ───────────────────────────────────────────────────────────

export type TodaySummaryWidgetConfig = {
  show_streak?: boolean
}

export type DailyActionsListWidgetConfig = {
  max_items: number
  show_completed: boolean
}

// ── Widget data shapes ───────────────────────────────────────────────────────

export type TodaySummaryWidgetData = {
  summary: TodaySummary
  streak: {
    currentStreak: number
    bestStreak: number
    todayStatus: string
    actionsToWin: number
    hasHistory: boolean
  }
}

export type DailyActionsListWidgetData = {
  actions: DailyActionRow[]
  total: number
}

// ── Defaults ────────────────────────────────────────────────────────────────

export function defaultTodaySummaryConfig(): TodaySummaryWidgetConfig {
  return { show_streak: false }
}

export function defaultDailyActionsListConfig(): DailyActionsListWidgetConfig {
  return { max_items: 5, show_completed: false }
}
