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
import { ProspectingSummaryWidget } from '@/features/prospecting/widgets/components/ProspectingSummaryWidget'
import { ConnectionRateWidget } from '@/features/prospecting/widgets/components/ConnectionRateWidget'
import { HotLeadsWidget } from '@/features/prospecting/widgets/components/HotLeadsWidget'
import { FollowupsDueWidget } from '@/features/prospecting/widgets/components/FollowupsDueWidget'
import { ActiveCallSessionWidget } from '@/features/prospecting/widgets/components/ActiveCallSessionWidget'
import { ExecutionScoreWidget } from '@/features/coaching/widgets/components/ExecutionScoreWidget'
import { TalkToPaceWidget } from '@/features/coaching/widgets/components/TalkToPaceWidget'
import { PartnerGrowthWidget } from '@/features/coaching/widgets/components/PartnerGrowthWidget'
import { ProjectionWidget } from '@/features/coaching/widgets/components/ProjectionWidget'
import { PartnerHealthWidget } from '@/features/coaching/widgets/components/PartnerHealthWidget'
import { PaceForecastWidget } from '@/features/coaching/widgets/components/PaceForecastWidget'
import { WeeklyScorecardWidget } from '@/features/coaching/widgets/components/WeeklyScorecardWidget'
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

  if (data.type === 'prospecting_summary') {
    return (
      <WidgetShell {...shellProps}>
        <ProspectingSummaryWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'connection_rate') {
    return (
      <WidgetShell {...shellProps}>
        <ConnectionRateWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'hot_leads') {
    return (
      <WidgetShell {...shellProps}>
        <HotLeadsWidget data={data.data} onRecordClick={onRecordClick} />
      </WidgetShell>
    )
  }

  if (data.type === 'followups_due') {
    return (
      <WidgetShell {...shellProps}>
        <FollowupsDueWidget data={data.data} onRecordClick={onRecordClick} />
      </WidgetShell>
    )
  }

  if (data.type === 'active_call_session') {
    return (
      <WidgetShell {...shellProps}>
        <ActiveCallSessionWidget data={data.data} />
      </WidgetShell>
    )
  }

  if (data.type === 'execution_score') {
    return <WidgetShell {...shellProps}><ExecutionScoreWidget data={data.data} /></WidgetShell>
  }

  if (data.type === 'talk_to_pace') {
    return <WidgetShell {...shellProps}><TalkToPaceWidget data={data.data} /></WidgetShell>
  }

  if (data.type === 'partner_growth') {
    return <WidgetShell {...shellProps}><PartnerGrowthWidget data={data.data} onRecordClick={onRecordClick} /></WidgetShell>
  }

  if (data.type === 'projected_closings' || data.type === 'projected_income') {
    return <WidgetShell {...shellProps}><ProjectionWidget data={data.data} /></WidgetShell>
  }

  if (data.type === 'partner_health') {
    return <WidgetShell {...shellProps}><PartnerHealthWidget data={data.data} onRecordClick={onRecordClick} /></WidgetShell>
  }

  if (data.type === 'pace_forecast') {
    return <WidgetShell {...shellProps}><PaceForecastWidget data={data.data} /></WidgetShell>
  }

  if (data.type === 'weekly_scorecard') {
    return <WidgetShell {...shellProps}><WeeklyScorecardWidget data={data.data} /></WidgetShell>
  }

  return null
}
