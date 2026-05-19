import type { WidgetType } from '@/types/database'
import { MetricWidget } from './components/MetricWidget'
import { ListWidget } from './components/ListWidget'
import { BoardSummaryWidget } from './components/BoardSummaryWidget'
import { ActivityFeedWidget } from './components/ActivityFeedWidget'
import { GoalProgressWidget } from '@/features/goals/widgets/components/GoalProgressWidget'
import { FunnelPaceWidget } from '@/features/goals/widgets/components/FunnelPaceWidget'
import { GapAnalysisWidget } from '@/features/goals/widgets/components/GapAnalysisWidget'
import { TodaySummaryWidget } from '@/features/daily-actions/widgets/TodaySummaryWidget'
import { DailyActionsListWidget } from '@/features/daily-actions/widgets/DailyActionsListWidget'

export const WIDGET_REGISTRY: Record<WidgetType, React.ElementType> = {
  metric:             MetricWidget,
  list:               ListWidget,
  board_summary:      BoardSummaryWidget,
  activity_feed:      ActivityFeedWidget,
  saved_view:         ListWidget,
  goal_progress:      GoalProgressWidget,
  funnel_pace:        FunnelPaceWidget,
  gap_analysis:       GapAnalysisWidget,
  today_summary:      TodaySummaryWidget,
  daily_actions_list: DailyActionsListWidget,
}

export const WIDGET_META: Record<WidgetType, { label: string; description: string; defaultWidth: number }> = {
  metric: {
    label: 'Metric',
    description: 'Show a count or total value from any board',
    defaultWidth: 1,
  },
  list: {
    label: 'List',
    description: 'Display a filtered list of records',
    defaultWidth: 2,
  },
  board_summary: {
    label: 'Board Summary',
    description: 'Breakdown of records by group, status, or priority',
    defaultWidth: 2,
  },
  activity_feed: {
    label: 'Activity Feed',
    description: 'Recent activity across your organization',
    defaultWidth: 2,
  },
  saved_view: {
    label: 'Saved View',
    description: 'Records from a saved board filter',
    defaultWidth: 2,
  },
  goal_progress: {
    label: 'Goal Progress',
    description: 'Pacing toward a production goal — current, target, projected',
    defaultWidth: 1,
  },
  funnel_pace: {
    label: 'Funnel Pace',
    description: 'Required activity pace by stage (e.g. leads/day)',
    defaultWidth: 2,
  },
  gap_analysis: {
    label: 'Gap Analysis',
    description: 'Where production is ahead or behind by stage',
    defaultWidth: 2,
  },
  today_summary: {
    label: 'Win the Day',
    description: 'Your daily action counts, completion rate, and pace status',
    defaultWidth: 1,
  },
  daily_actions_list: {
    label: 'Daily Actions',
    description: 'Top actions due today from the daily cockpit',
    defaultWidth: 2,
  },
}
