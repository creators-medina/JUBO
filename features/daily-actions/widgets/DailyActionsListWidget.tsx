import Link from 'next/link'
import { ListChecks, ChevronRight, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DailyActionsListWidgetData } from '../types'

const PRIORITY_DOT: Record<string, string> = {
  urgent: 'bg-red-400',
  high:   'bg-orange-400',
  medium: 'bg-amber-400',
  low:    'bg-blue-400',
  none:   'bg-zinc-500',
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

  return (
    <div className="h-full flex flex-col gap-1.5">
      <div className="space-y-0.5 -mx-2 flex-1 overflow-y-auto">
        {data.actions.map(a => (
          <div key={a.id} className={cn(
            'flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-surface-1 transition-colors',
            a.completed_at && 'opacity-50',
          )}>
            {a.completed_at
              ? <CheckCircle2 className="w-3 h-3 text-emerald-400 flex-shrink-0" />
              : <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', PRIORITY_DOT[a.priority])} />
            }
            <span className={cn('text-sm text-foreground flex-1 truncate', a.completed_at && 'line-through')}>
              {a.title}
            </span>
            <span className="text-2xs text-muted-foreground uppercase tracking-wider">{a.source.replace('_', ' ')}</span>
          </div>
        ))}
      </div>
      <Link href="/today" className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground transition-colors pt-1">
        Open Today
        <ChevronRight className="w-2.5 h-2.5" />
      </Link>
    </div>
  )
}
