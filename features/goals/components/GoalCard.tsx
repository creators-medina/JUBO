'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar, Target, TrendingUp, TrendingDown, Minus, RefreshCw, Archive } from 'lucide-react'
import { cn } from '@/lib/utils'
import { regenerateGoalTargets, archiveProductionGoal } from '../actions'
import { calculateRequiredStageTargets } from '../calculations/engine'
import type {
  ProductionGoalRow, FunnelRow, FunnelStageRow, ConversionAssumptionRow,
} from '../types'

interface Props {
  goal: ProductionGoalRow
  funnel: FunnelRow | null
  stages: FunnelStageRow[]
  assumptions: ConversionAssumptionRow[]
  organizationId: string
}

export function GoalCard({ goal, funnel, stages, assumptions }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const required = funnel && goal.target_units
    ? calculateRequiredStageTargets(goal, stages, assumptions)
    : []

  const handleRegenerate = () => {
    setError('')
    startTransition(async () => {
      try { await regenerateGoalTargets(goal.id); router.refresh() }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed to regenerate') }
    })
  }
  const handleArchive = () => {
    if (!confirm(`Archive "${goal.name}"?`)) return
    startTransition(async () => {
      try { await archiveProductionGoal(goal.id); router.refresh() }
      catch (e) { setError(e instanceof Error ? e.message : 'Failed to archive') }
    })
  }

  const hasAssumptionChain = required.length === stages.length && stages.length > 0

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{goal.name}</h3>
            <div className="flex items-center gap-3 text-2xs text-muted-foreground mt-1">
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {goal.start_date} → {goal.end_date}
              </span>
              <span className="capitalize">{goal.timeframe}</span>
              {funnel && <span>· {funnel.name}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {funnel && goal.target_units != null && (
              <button onClick={handleRegenerate} disabled={isPending}
                className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors disabled:opacity-50"
                title="Recompute stage targets from assumptions"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', isPending && 'animate-spin')} />
              </button>
            )}
            <button onClick={handleArchive} disabled={isPending}
              className="p-1.5 rounded-md text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-colors disabled:opacity-50"
              title="Archive goal"
            >
              <Archive className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <TargetStat icon={Target} label="Units" value={goal.target_units} kind="count" />
          <TargetStat icon={TrendingUp} label="Volume" value={goal.target_volume} kind="money" />
          <TargetStat icon={TrendingUp} label="Revenue" value={goal.target_revenue} kind="money" />
        </div>
      </div>

      <div className="px-5 py-3">
        <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Required pace by stage</p>
        {!funnel ? (
          <p className="text-xs text-muted-foreground">Attach a funnel to compute stage pacing.</p>
        ) : !goal.target_units ? (
          <p className="text-xs text-muted-foreground">Set a units target to compute stage pacing.</p>
        ) : required.length === 0 ? (
          <p className="text-xs text-muted-foreground">Add conversion assumptions in the Assumptions tab.</p>
        ) : (
          <div className="space-y-1">
            {required.map(r => {
              const stage = stages.find(s => s.id === r.funnel_stage_id)!
              return (
                <div key={r.funnel_stage_id} className="flex items-center gap-3 py-1 text-xs">
                  <span className="flex-1 text-foreground truncate">{stage.name}</span>
                  <span className="text-muted-foreground tabular-nums w-16 text-right">{r.daily_target < 1 ? r.daily_target.toFixed(2) : Math.ceil(r.daily_target).toLocaleString()}/d</span>
                  <span className="text-muted-foreground tabular-nums w-20 text-right">{Math.ceil(r.weekly_target).toLocaleString()}/wk</span>
                  <span className="text-muted-foreground tabular-nums w-20 text-right">{Math.ceil(r.monthly_target).toLocaleString()}/mo</span>
                </div>
              )
            })}
            {!hasAssumptionChain && (
              <p className="text-2xs text-amber-400 mt-2 flex items-center gap-1">
                <Minus className="w-3 h-3" /> Some stages are missing conversion rates — they were skipped.
              </p>
            )}
          </div>
        )}
      </div>

      {error && <p className="px-5 pb-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}

function TargetStat({ icon: Icon, label, value, kind }: {
  icon: React.ElementType
  label: string
  value: number | null
  kind: 'count' | 'money'
}) {
  return (
    <div className="rounded-lg bg-surface-1 px-3 py-2">
      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground uppercase tracking-wider">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <p className="text-sm font-semibold text-foreground tabular-nums mt-1">
        {value == null ? '—' : kind === 'money' ? `$${Math.round(value).toLocaleString()}` : Math.round(value).toLocaleString()}
      </p>
    </div>
  )
}
