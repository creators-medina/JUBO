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

export const WIDGET_REGISTRY: Record<WidgetType, React.ElementType> = {
  metric:              MetricWidget,
  list:                ListWidget,
  board_summary:       BoardSummaryWidget,
  activity_feed:       ActivityFeedWidget,
  saved_view:          ListWidget,
  goal_progress:       GoalProgressWidget,
  funnel_pace:         FunnelPaceWidget,
  gap_analysis:        GapAnalysisWidget,
  today_summary:       TodaySummaryWidget,
  daily_actions_list:  DailyActionsListWidget,
  prospecting_summary: ProspectingSummaryWidget,
  connection_rate:     ConnectionRateWidget,
  hot_leads:           HotLeadsWidget,
  followups_due:       FollowupsDueWidget,
  active_call_session: ActiveCallSessionWidget,
  execution_score:     ExecutionScoreWidget,
  talk_to_pace:        TalkToPaceWidget,
  partner_growth:      PartnerGrowthWidget,
  projected_closings:  ProjectionWidget,
  projected_income:    ProjectionWidget,
  partner_health:      PartnerHealthWidget,
  pace_forecast:       PaceForecastWidget,
  weekly_scorecard:    WeeklyScorecardWidget,
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
  prospecting_summary: {
    label: 'Prospecting Summary',
    description: 'Calls, connects, connection rate, and pace to your daily goal',
    defaultWidth: 1,
  },
  connection_rate: {
    label: 'Connection Rate',
    description: 'Today vs. this week connection rate with trend',
    defaultWidth: 1,
  },
  hot_leads: {
    label: 'Hot Leads',
    description: 'Top hot/warm leads from your call queue',
    defaultWidth: 2,
  },
  followups_due: {
    label: 'Follow-ups Due',
    description: 'Communication follow-ups due today or overdue',
    defaultWidth: 2,
  },
  active_call_session: {
    label: 'Call Session',
    description: 'Your live prospecting session — calls, connects, pace',
    defaultWidth: 1,
  },
  execution_score: {
    label: 'Execution Score',
    description: 'Daily discipline score across talk-tos, pacing, and follow-up',
    defaultWidth: 1,
  },
  talk_to_pace: {
    label: 'Talk-To Pace',
    description: 'Real conversations vs your reverse-engineered target',
    defaultWidth: 1,
  },
  partner_growth: {
    label: 'Partner Growth',
    description: 'Active partners vs needed, with your top partners',
    defaultWidth: 2,
  },
  projected_closings: {
    label: 'Projected Closings',
    description: 'Where your closings land on current pace',
    defaultWidth: 1,
  },
  projected_income: {
    label: 'Projected Income',
    description: 'Where your income lands on current pace',
    defaultWidth: 1,
  },
  partner_health: {
    label: 'Partner Health',
    description: 'Partner status mix and who to reconnect with',
    defaultWidth: 2,
  },
  pace_forecast: {
    label: 'Pace Forecast',
    description: 'Closings, income, and talk-tos projected to goal',
    defaultWidth: 2,
  },
  weekly_scorecard: {
    label: 'Weekly Scorecard',
    description: 'This week’s talk-tos, partner touches, and execution',
    defaultWidth: 2,
  },
}
