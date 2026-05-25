// ─────────────────────────────────────────────────────────────────────────
// Starter DASHBOARD templates — pure data.
//
// Widgets reference boards by `boardKey` and the starter production goal via
// `useGoal`. The generator resolves those to real ids after the boards/goals
// exist, then calls the existing widget engine (addWidget). No widget logic
// is duplicated here.
// ─────────────────────────────────────────────────────────────────────────

import type { WidgetType } from '@/types/database'

export type WidgetSpec = {
  widget_type: WidgetType
  title: string
  width: number             // 1=25% 2=50% 3=75% 4=100%
  height?: number
  /** config may contain `boardKey` (→ board_id) and `useGoal` (→ production_goal_id) markers */
  config: Record<string, unknown>
}

export type DashboardTemplate = {
  key: string
  name: string
  description: string
  icon: string
  color: string
  widgets: WidgetSpec[]
}

export const DASHBOARD_TEMPLATES: DashboardTemplate[] = [
  {
    key: 'win-the-day',
    name: 'Win the Day',
    description: 'Your daily operating cockpit.',
    icon: 'Sunrise',
    color: '#f59e0b',
    widgets: [
      { widget_type: 'today_summary',      title: 'Today',            width: 2, height: 1, config: { show_streak: true } },
      { widget_type: 'daily_actions_list', title: "Today's Actions",  width: 2, height: 2, config: { max_items: 8, show_completed: false } },
      { widget_type: 'funnel_pace',        title: 'Daily Pace',       width: 2, height: 1, config: { useGoal: true, cadence: 'daily', stage_ids: null } },
      { widget_type: 'gap_analysis',       title: 'Where You Stand',  width: 2, height: 1, config: { useGoal: true, cadence: 'weekly' } },
    ],
  },
  {
    key: 'production',
    name: 'Production',
    description: 'Goal pacing and production health.',
    icon: 'TrendingUp',
    color: '#22c55e',
    widgets: [
      { widget_type: 'goal_progress', title: 'Annual Goal',       width: 2, height: 1, config: { useGoal: true, metric: 'units', display: 'bar' } },
      { widget_type: 'funnel_pace',   title: 'Monthly Pace',      width: 2, height: 1, config: { useGoal: true, cadence: 'monthly', stage_ids: null } },
      { widget_type: 'gap_analysis',  title: 'Gap Analysis',      width: 2, height: 1, config: { useGoal: true, cadence: 'monthly' } },
      { widget_type: 'board_summary', title: 'Pipeline by Stage', width: 2, height: 1, config: { boardKey: 'pipeline', group_by: 'group' } },
      { widget_type: 'metric',        title: 'Active Leads',      width: 1, height: 1, config: { boardKey: 'active_leads', aggregation: 'count', filters: [], icon: 'UserPlus', color: 'indigo' } },
      { widget_type: 'metric',        title: 'Open Files',        width: 1, height: 1, config: { boardKey: 'pipeline', aggregation: 'count', filters: [], icon: 'GitBranch', color: 'violet' } },
    ],
  },
  {
    key: 'pipeline',
    name: 'Pipeline',
    description: 'Active loans, stages, and stale files.',
    icon: 'GitBranch',
    color: '#8b5cf6',
    widgets: [
      { widget_type: 'board_summary', title: 'Files by Stage',  width: 2, height: 1, config: { boardKey: 'pipeline', group_by: 'group' } },
      { widget_type: 'metric',        title: 'Total Files',     width: 1, height: 1, config: { boardKey: 'pipeline', aggregation: 'count', filters: [], icon: 'Files', color: 'blue' } },
      { widget_type: 'metric',        title: 'Pipeline Volume', width: 1, height: 1, config: { boardKey: 'pipeline', aggregation: 'sum', filters: [], icon: 'DollarSign', color: 'green', prefix: '$' } },
      { widget_type: 'list',          title: 'Needs Attention', width: 2, height: 2, config: { boardKey: 'pipeline', filters: [], sort_field: 'updated_at', sort_direction: 'asc', max_records: 10 } },
      { widget_type: 'gap_analysis',  title: 'Gap Analysis',    width: 2, height: 1, config: { useGoal: true, cadence: 'weekly' } },
    ],
  },
]

export function dashboardTemplateByKey(key: string): DashboardTemplate | undefined {
  return DASHBOARD_TEMPLATES.find(d => d.key === key)
}
