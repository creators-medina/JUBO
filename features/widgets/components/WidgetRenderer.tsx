'use client'

import { WidgetShell } from './WidgetShell'
import { MetricWidget } from './MetricWidget'
import { ListWidget } from './ListWidget'
import { BoardSummaryWidget } from './BoardSummaryWidget'
import { ActivityFeedWidget } from './ActivityFeedWidget'
import type {
  DashboardWidgetRow, WidgetData,
  MetricWidgetConfig, ListWidgetConfig, BoardSummaryWidgetConfig,
  ActivityFeedWidgetConfig,
} from '../types'

interface WidgetRendererProps {
  widget: DashboardWidgetRow
  data: WidgetData
  onRemove?: () => void
  onEdit?: () => void
  onRecordClick?: (recordId: string) => void
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>
}

export function WidgetRenderer({ widget, data, onRemove, onEdit, onRecordClick, dragHandleProps }: WidgetRendererProps) {
  const shellProps = { title: widget.title, onRemove, onEdit, dragHandleProps }

  if (data.type === 'error') {
    return <WidgetShell {...shellProps} error={data.message}>{null}</WidgetShell>
  }

  if (data.type === 'metric') {
    return (
      <WidgetShell {...shellProps}>
        <MetricWidget config={widget.config as MetricWidgetConfig} data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'list' || data.type === 'saved_view') {
    return (
      <WidgetShell {...shellProps}>
        <ListWidget data={data.data} onRecordClick={onRecordClick} />
      </WidgetShell>
    )
  }

  if (data.type === 'board_summary') {
    return (
      <WidgetShell {...shellProps}>
        <BoardSummaryWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'activity_feed') {
    return (
      <WidgetShell {...shellProps}>
        <ActivityFeedWidget data={data.data} />
      </WidgetShell>
    )
  }

  return null
}
