import { TrendingUp, TrendingDown, Minus, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GoalProgressData } from '../../types'

interface Props { data: GoalProgressData }

const METRIC_LABEL: Record<string, string> = {
  units: 'Units',
  volume: 'Volume',
  revenue: 'Revenue',
}

function formatMetric(value: number, metric: string): string {
  if (metric === 'units') return Math.round(value).toLocaleString()
  return '$' + Math.round(value).toLocaleString()
}

function paceIcon(pacePercent: number) {
  if (pacePercent >= 105) return { Icon: TrendingUp,   color: 'text-emerald-400', label: 'Ahead' }
  if (pacePercent <= 95)  return { Icon: TrendingDown, color: 'text-red-400',     label: 'Behind' }
  return                       { Icon: Minus,         color: 'text-amber-400',   label: 'On pace' }
}

export function GoalProgressWidget({ data }: Props) {
  const { Icon, color, label } = paceIcon(data.pace_percent)
  const progress = Math.max(0, Math.min(100, data.progress_percent))

  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs text-muted-foreground uppercase tracking-wider">{METRIC_LABEL[data.metric] ?? data.metric}</p>
          <p className="text-2xl font-semibold text-foreground tabular-nums">
            {formatMetric(data.current, data.metric)}
          </p>
          <p className="text-xs text-muted-foreground">
            of <span className="tabular-nums">{formatMetric(data.target, data.metric)}</span> target
          </p>
        </div>
        <div className={cn('flex items-center gap-1.5 text-xs font-medium', color)}>
          <Icon className="w-3.5 h-3.5" />
          <span className="tabular-nums">{Math.round(data.pace_percent)}%</span>
          <span className="text-muted-foreground">{label}</span>
        </div>
      </div>

      {data.display === 'radial' ? (
        <Radial percent={progress} />
      ) : (
        <ProgressBar percent={progress} expectedPercent={data.target > 0 ? (data.expected_at_now / data.target) * 100 : 0} />
      )}

      <div className="mt-auto grid grid-cols-3 gap-2 text-2xs">
        <Stat label="Projected"  value={formatMetric(data.projected_finish, data.metric)} />
        <Stat label="Elapsed"    value={`${data.days_elapsed}/${data.days_total}d`} />
        <Stat label="Remaining"  value={`${data.days_remaining}d`} />
      </div>
    </div>
  )
}

function ProgressBar({ percent, expectedPercent }: { percent: number; expectedPercent: number }) {
  return (
    <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
      <div className="absolute inset-y-0 left-0 bg-primary rounded-full transition-all" style={{ width: `${Math.min(100, percent)}%` }} />
      {expectedPercent > 0 && expectedPercent < 100 && (
        <div
          className="absolute inset-y-0 w-0.5 bg-amber-400/70"
          style={{ left: `${Math.min(100, expectedPercent)}%` }}
          title={`Expected: ${Math.round(expectedPercent)}%`}
        />
      )}
    </div>
  )
}

function Radial({ percent }: { percent: number }) {
  const r = 32, c = 2 * Math.PI * r
  const dash = c * (Math.min(100, percent) / 100)
  return (
    <div className="flex items-center justify-center py-2">
      <svg width="84" height="84" viewBox="-42 -42 84 84" className="-rotate-90">
        <circle r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-surface-2" />
        <circle
          r={r} fill="none" stroke="currentColor" strokeWidth="6"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          className="text-primary transition-all"
        />
      </svg>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface-1 px-2 py-1.5">
      <p className="text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-foreground font-medium tabular-nums">{value}</p>
    </div>
  )
}

export function GoalProgressEmpty() {
  return (
    <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
      <Target className="w-5 h-5" />
      <p className="text-xs">Select a production goal in widget settings.</p>
    </div>
  )
}
