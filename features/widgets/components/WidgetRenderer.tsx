'use client'

import { WidgetShell } from './WidgetShell'
import { MetricWidget } from './MetricWidget'
import { ListWidget } from './ListWidget'
import { BoardSummaryWidget } from './BoardSummaryWidget'
import type { DashboardWidgetRow, WidgetData, MetricWidgetConfig, ListWidgetConfig, BoardSummaryWidgetConfig } from '../types'

interface WidgetRendererProps {
  widget: DashboardWidgetRow
  data: WidgetData
  onRemove?: () => void
  onEdit?: () => void
}

export function WidgetRenderer({ widget, data, onRemove, onEdit }: WidgetRendererProps) {
  const shellProps = {
    title: widget.title,
    onRemove,
    onEdit,
  }

  if (data.type === 'error') {
    return <WidgetShell {...shellProps} error={data.message}>{null}</WidgetShell>
  }

  if (data.type === 'metric') {
    return (
      <WidgetShell {...shellProps}>
        <MetricWidget
          config={widget.config as MetricWidgetConfig}
          data={data.data}
        />
      </WidgetShell>
    )
  }

  if (data.type === 'list') {
    return (
      <WidgetShell {...shellProps}>
        <ListWidget data={data.data} />
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

  return null
}
