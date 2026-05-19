import Link from 'next/link'
import { Sunrise, CheckCircle2, AlertTriangle, ListChecks, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TodaySummaryWidgetData, DailyProgressStatus } from '../types'

const STATUS_TEXT: Record<DailyProgressStatus, string> = {
  ahead:   'text-emerald-400',
  on_pace: 'text-amber-400',
  behind:  'text-red-400',
  unknown: 'text-muted-foreground',
}

export function TodaySummaryWidget({ data }: { data: TodaySummaryWidgetData }) {
  const { summary } = data
  return (
    <div className="h-full flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Sunrise className="w-4 h-4 text-primary" />
        <p className="text-xs font-medium text-foreground">Win the Day</p>
      </div>

      <div className="grid grid-cols-3 gap-2 flex-1">
        <Cell label="Done"    value={summary.completed} icon={CheckCircle2} accent="text-emerald-400" />
        <Cell label="Open"    value={summary.open}      icon={ListChecks}   accent="text-foreground" />
        <Cell label="Overdue" value={summary.overdue}   icon={AlertTriangle} accent={summary.overdue > 0 ? 'text-red-400' : 'text-muted-foreground'} />
      </div>

      <div className="space-y-1">
        <p className={cn('text-xs font-medium', STATUS_TEXT[summary.paceStatus])}>{summary.paceLabel}</p>
        <Link href="/today" className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors">
          Open Today
          <ChevronRight className="w-2.5 h-2.5" />
        </Link>
      </div>
    </div>
  )
}

function Cell({ label, value, icon: Icon, accent }: { label: string; value: number; icon: React.ElementType; accent: string }) {
  return (
    <div className="rounded-md bg-surface-1 px-2 py-1.5 flex flex-col gap-0.5">
      <div className="flex items-center justify-between">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <Icon className={cn('w-3 h-3', accent)} />
      </div>
      <p className={cn('text-base font-semibold tabular-nums', accent)}>{value}</p>
    </div>
  )
}
