'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Circle, Trash2, ExternalLink, Zap, ClipboardCheck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { completeDailyAction, reopenDailyAction, deleteDailyAction } from '../actions'
import type { DailyActionRow } from '../types'

const PRIORITY_PILL: Record<string, string> = {
  urgent: 'bg-red-500/15 text-red-400 border-red-500/30',
  high:   'bg-orange-500/15 text-orange-400 border-orange-500/30',
  medium: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  low:    'bg-blue-500/15 text-blue-400 border-blue-500/30',
  none:   'bg-surface-2 text-muted-foreground border-border',
}

const SOURCE_ICON: Record<string, React.ElementType> = {
  task:         ClipboardCheck,
  goal_pacing:  Zap,
  manual:       Circle,
  saved_view:   ClipboardCheck,
  record:       ClipboardCheck,
}

interface Props {
  action: DailyActionRow
  recordLink?: string | null
}

export function DailyActionItem({ action, recordLink }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const completed = !!action.completed_at

  const toggle = () => {
    startTransition(async () => {
      try {
        if (completed) await reopenDailyAction(action.id)
        else await completeDailyAction(action.id)
        router.refresh()
      } catch {}
    })
  }

  const remove = () => {
    if (!confirm(`Remove "${action.title}"?`)) return
    startTransition(async () => {
      await deleteDailyAction(action.id)
      router.refresh()
    })
  }

  const SourceIcon = SOURCE_ICON[action.source] ?? Circle

  return (
    <div className={cn(
      'group flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all',
      completed ? 'bg-surface-1/30 border-border/50 opacity-60' : 'bg-card border-border hover:border-border/80',
    )}>
      <button
        onClick={toggle}
        disabled={isPending}
        title={completed ? 'Reopen' : 'Complete'}
        className={cn(
          'mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
          completed
            ? 'bg-emerald-500 border-emerald-500 text-emerald-50'
            : 'border-border hover:border-primary hover:bg-primary/5',
        )}
      >
        {isPending ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
         : completed ? <Check className="w-2.5 h-2.5" />
         : null}
      </button>

      <div className="flex-1 min-w-0 space-y-0.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={cn(
            'text-sm font-medium text-foreground truncate',
            completed && 'line-through text-muted-foreground',
          )}>
            {action.title}
          </p>
          <span className={cn('text-2xs px-1.5 py-0.5 rounded-full border uppercase tracking-wider', PRIORITY_PILL[action.priority])}>
            {action.priority}
          </span>
          <span className="inline-flex items-center gap-1 text-2xs text-muted-foreground">
            <SourceIcon className="w-3 h-3" />
            {action.source.replace('_', ' ')}
          </span>
        </div>
        {action.description && (
          <p className={cn('text-xs text-muted-foreground line-clamp-2', completed && 'line-through')}>
            {action.description}
          </p>
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        {recordLink && (
          <Link
            href={recordLink}
            title="Open linked record"
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2"
          >
            <ExternalLink className="w-3 h-3" />
          </Link>
        )}
        <button
          onClick={remove}
          disabled={isPending}
          title="Remove"
          className="p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-surface-2 disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
