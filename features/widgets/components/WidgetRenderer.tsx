'use client'

import { WidgetShell } from './WidgetShell'
import { MetricWidget } from './MetricWidget'
import { ListWidget } from './ListWidget'
import { BoardSummaryWidget } from './BoardSummaryWidget'
import { ActivityFeedWidget } from './ActivityFeedWidget'
import { GoalProgressWidget } from '@/features/goals/widgets/components/GoalProgressWidget'
import { FunnelPaceWidget } from '@/features/goals/widgets/components/FunnelPaceWidget'
import { GapAnalysisWidget } from '@/features/goals/widgets/components/GapAnalysisWidget'
import { TodaySummaryWidget } from '@/features/daily-actions/widgets/TodaySummaryWidget'
import { DailyActionsListWidget } from '@/features/daily-actions/widgets/DailyActionsListWidget'
import type {
  DashboardWidgetRow, WidgetData,
  MetricWidgetConfig,
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

  if (data.type === 'goal_progress') {
    return (
      <WidgetShell {...shellProps}>
        <GoalProgressWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'funnel_pace') {
    return (
      <WidgetShell {...shellProps}>
        <FunnelPaceWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'gap_analysis') {
    return (
      <WidgetShell {...shellProps}>
        <GapAnalysisWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'today_summary') {
    return (
      <WidgetShell {...shellProps}>
        <TodaySummaryWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'daily_actions_list') {
    return (
      <WidgetShell {...shellProps}>
        <DailyActionsListWidget data={data.data} />
      </WidgetShell>
    )
  }

  return null
}
