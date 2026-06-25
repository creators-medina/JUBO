import Link from 'next/link'
import { ListChecks, ChevronRight, CheckCircle2, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DailyActionsListWidgetData } from '../types'

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-jubo-red',
  high:   'bg-jubo-red',
  medium: 'bg-jubo-gold',
  low:    'bg-jubo-navy',
  none:   'bg-jubo-muted',
}

const PRIORITY_PILL: Record<string, string> = {
  urgent: 'text-jubo-red',
  high:   'text-jubo-red',
  medium: 'text-jubo-gold',
  low:    'text-jubo-navy',
  none:   'text-muted-foreground',
}

export function DailyActionsListWidget({ data }: { data: DailyActionsListWidgetData }) {
  if (data.actions.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <ListChecks className="w-5 h-5" />
        <p className="text-xs">No actions today.</p>
        <Link href="/today" className="text-2xs text-primary hover:underline">Plan your day →</Link>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="space-y-0.5 -mx-2 flex-1 overflow-y-auto">
        {data.actions.map(a => {
          const overdue = !a.completed_at && a.due_date < today
          const recordTitle = (a.metadata && typeof a.metadata === 'object' && 'record_title' in a.metadata)
            ? (a.metadata as { record_title?: string }).record_title
            : null
          return (
            <div key={a.id} className={cn(
              'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-1 transition-colors',
              a.completed_at && 'opacity-50',
            )}>
              {a.completed_at
                ? <CheckCircle2 className="w-3 h-3 text-jubo-green flex-shrink-0" />
                : <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', PRIORITY_DOT[a.priority])} />
              }

              <div className="flex-1 min-w-0">
                <p className={cn('text-sm text-foreground truncate', a.completed_at && 'line-through')}>
                  {a.title}
                </p>
                {(recordTitle || a.record_id) && (
                  <p className="text-2xs text-muted-foreground truncate flex items-center gap-1">
                    <ExternalLink className="w-2.5 h-2.5" />
                    {recordTitle ?? 'linked record'}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 flex-shrink-0">
                {a.priority !== 'none' && (
                  <span className={cn('text-2xs font-medium uppercase tracking-wider', PRIORITY_PILL[a.priority])}>
                    {a.priority.slice(0, 3)}
                  </span>
                )}
                {!a.completed_at && (
                  <span className={cn('text-2xs tabular-nums', overdue ? 'text-jubo-red' : 'text-muted-foreground')}>
                    {overdue ? 'overdue' : (a.due_date === today ? 'today' : a.due_date)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <Link href="/today" className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors pt-1">
        Open Today
        <ChevronRight className="w-2.5 h-2.5" />
      </Link>
    </div>
  )
}
