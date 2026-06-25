'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Check, Circle, Trash2, ExternalLink, Zap, ClipboardCheck, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { completeDailyAction, reopenDailyAction, deleteDailyAction, snoozeDailyAction } from '../actions'
import { SnoozeMenu } from './SnoozeMenu'
import type { DailyActionRow } from '../types'

// LOS priority semantics: dusty red = urgent/high, gold = medium attention,
// navy = low (neutral active), taupe = none.
const PRIORITY_PILL: Record<string, string> = {
  urgent: 'bg-jubo-red/10 text-jubo-red border-jubo-red/30',
  high:   'bg-jubo-red/[0.06] text-jubo-red border-jubo-red/20',
  medium: 'bg-jubo-gold-soft text-jubo-gold border-jubo-gold/40',
  low:    'bg-jubo-navy/[0.06] text-jubo-navy border-jubo-navy/20',
  none:   'bg-jubo-card-soft text-jubo-muted border-jubo-border',
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
  selected?: boolean
  onToggleSelect?: () => void
  selectionMode?: boolean
}

export function DailyActionItem({ action, recordLink, selected, onToggleSelect, selectionMode }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const completed = !!action.completed_at

  const toggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (selectionMode) { onToggleSelect?.(); return }
    startTransition(async () => {
      try {
        if (completed) await reopenDailyAction(action.id)
        else await completeDailyAction(action.id)
        router.refresh()
      } catch {}
    })
  }

  const remove = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm(`Remove "${action.title}"?`)) return
    startTransition(async () => {
      await deleteDailyAction(action.id)
      router.refresh()
    })
  }

  const snooze = (dueDate: string) => {
    startTransition(async () => {
      await snoozeDailyAction(action.id, dueDate)
      router.refresh()
    })
  }

  const SourceIcon = SOURCE_ICON[action.source] ?? Circle

  return (
    <div
      onClick={() => onToggleSelect?.()}
      className={cn(
        'group flex items-start gap-3 px-3 py-2.5 rounded-lg border transition-all',
        completed ? 'bg-surface-1/30 border-border/50 opacity-60' : 'bg-card border-border hover:border-border/80',
        selected && 'ring-1 ring-jubo-navy border-jubo-navy/50',
        onToggleSelect && 'cursor-pointer',
      )}
    >
      <button
        onClick={toggleComplete}
        disabled={isPending}
        title={selectionMode ? (selected ? 'Deselect' : 'Select') : completed ? 'Reopen' : 'Complete'}
        className={cn(
          'mt-0.5 flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center transition-colors',
          selected
            ? 'bg-jubo-navy border-jubo-navy text-white'
            : completed
              ? 'bg-jubo-green border-jubo-green text-white'
              : 'border-border hover:border-jubo-navy hover:bg-jubo-navy/5',
        )}
      >
        {isPending ? <RefreshCw className="w-2.5 h-2.5 animate-spin" />
         : (selected || completed) ? <Check className="w-2.5 h-2.5" />
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
          {action.due_date && (
            <span className="text-2xs text-muted-foreground tabular-nums">{action.due_date}</span>
          )}
        </div>
        {action.description && (
          <p className={cn('text-xs text-muted-foreground line-clamp-2', completed && 'line-through')}>
            {action.description}
          </p>
        )}
      </div>

      <div
        onClick={(e) => e.stopPropagation()}
        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        {!completed && (
          <SnoozeMenu
            onPick={snooze}
            label=""
            buttonClassName="px-1.5 py-1 text-muted-foreground hover:text-foreground"
          />
        )}
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
          className="p-1 rounded text-muted-foreground hover:text-jubo-red hover:bg-surface-2 disabled:opacity-50"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
