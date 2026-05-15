import type { WidgetType } from '@/types/database'
import { MetricWidget } from './components/MetricWidget'
import { ListWidget } from './components/ListWidget'
import { BoardSummaryWidget } from './components/BoardSummaryWidget'
import { ActivityFeedWidget } from './components/ActivityFeedWidget'

export const WIDGET_REGISTRY: Record<WidgetType, React.ElementType> = {
  metric:        MetricWidget,
  list:          ListWidget,
  board_summary: BoardSummaryWidget,
  activity_feed: ActivityFeedWidget,
  saved_view:    ListWidget, // reuses list rendering
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
}
