import type { WidgetType } from '@/types/database'
import { MetricWidget } from './components/MetricWidget'
import { ListWidget } from './components/ListWidget'
import { BoardSummaryWidget } from './components/BoardSummaryWidget'

export const WIDGET_REGISTRY: Record<WidgetType, React.ElementType> = {
  metric:        MetricWidget,
  list:          ListWidget,
  board_summary: BoardSummaryWidget,
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
}
