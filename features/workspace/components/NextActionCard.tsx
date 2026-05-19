'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Zap, Check, Edit2, X, Calendar, Clock } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setNextAction, completeNextAction } from '../notes/actions'

interface Props {
  recordId: string
  nextAction: string | null
  nextActionDueAt: string | null
  nextActionCompletedAt: string | null
  compact?: boolean
}

function offsetISOLocal(days: number, base = new Date()): string {
  const d = new Date(base)
  d.setDate(d.getDate() + days)
  // datetime-local needs "YYYY-MM-DDTHH:mm"
  d.setSeconds(0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function localToISO(local: string): string | null {
  if (!local) return null
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

function isoToLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function NextActionCard({ recordId, nextAction, nextActionDueAt, nextActionCompletedAt, compact }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(!nextAction)
  const [text, setText] = useState(nextAction ?? '')
  const [dueLocal, setDueLocal] = useState(isoToLocal(nextActionDueAt))
  const [isPending, startTransition] = useTransition()

  const overdue = !nextActionCompletedAt && nextActionDueAt && new Date(nextActionDueAt) < new Date()
  const completed = !!nextActionCompletedAt

  const save = () => {
    if (!text.trim()) return
    startTransition(async () => {
      try {
        await setNextAction({
          record_id: recordId,
          next_action: text.trim(),
          next_action_due_at: localToISO(dueLocal),
        })
        setEditing(false)
        router.refresh()
      } catch {}
    })
  }

  const clear = () => {
    startTransition(async () => {
      try {
        await setNextAction({ record_id: recordId, next_action: null, next_action_due_at: null })
        setText('')
        setDueLocal('')
        setEditing(true)
        router.refresh()
      } catch {}
    })
  }

  const complete = () => {
    startTransition(async () => {
      try {
        await completeNextAction(recordId)
        router.refresh()
      } catch {}
    })
  }

  const snooze = (days: number) => {
    startTransition(async () => {
      try {
        await setNextAction({
          record_id: recordId,
          next_action: nextAction,
          next_action_due_at: new Date(offsetISOLocal(days)).toISOString(),
        })
        router.refresh()
      } catch {}
    })
  }

  return (
    <div className={cn(
      'rounded-xl border bg-card p-3 space-y-2',
      overdue ? 'border-red-500/40' : completed ? 'border-emerald-500/30' : 'border-border',
      compact && 'p-2.5 space-y-1.5',
    )}>
      <div className="flex items-center gap-1.5">
        <Zap className={cn('w-3.5 h-3.5', overdue ? 'text-red-400' : completed ? 'text-emerald-400' : 'text-primary')} />
        <p className="text-2xs uppercase tracking-wider text-muted-foreground flex-1">Next Action</p>
        {nextAction && !editing && !completed && (
          <button onClick={() => setEditing(true)} title="Edit"
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2">
            <Edit2 className="w-3 h-3" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setEditing(!!nextAction ? false : true); setText(nextAction ?? '') } }}
            placeholder="Set a next action…"
            autoFocus
            className="w-full px-2.5 py-1.5 rounded-md bg-surface-1 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={e => setDueLocal(e.target.value)}
              className="flex-1 px-2 py-1 rounded bg-surface-1 border border-border text-2xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={save}
              disabled={!text.trim() || isPending}
              className="flex-1 px-2 py-1 rounded-md bg-primary text-primary-foreground text-2xs font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            {nextAction && (
              <button
                onClick={() => { setEditing(false); setText(nextAction); setDueLocal(isoToLocal(nextActionDueAt)) }}
                className="px-2 py-1 rounded-md text-2xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className={cn('text-sm font-medium', completed ? 'line-through text-muted-foreground' : 'text-foreground')}>
            {nextAction}
          </p>
          {nextActionDueAt && (
            <div className={cn('flex items-center gap-1 text-2xs',
              overdue ? 'text-red-400' : 'text-muted-foreground'
            )}>
              <Clock className="w-2.5 h-2.5" />
              <span className="tabular-nums">
                {overdue ? 'Overdue · ' : 'Due '}
                {new Date(nextActionDueAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
          )}

          {!completed && (
            <div className="flex items-center gap-1 pt-1">
              <button onClick={complete} disabled={isPending}
                className="flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/15 text-emerald-400 text-2xs font-medium hover:bg-emerald-500/25 disabled:opacity-50 transition-colors">
                <Check className="w-2.5 h-2.5" />
                Complete
              </button>
              <button onClick={() => snooze(1)} disabled={isPending} title="Snooze 1 day"
                className="px-2 py-1 rounded-md text-2xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors">
                +1d
              </button>
              <button onClick={() => snooze(3)} disabled={isPending} title="Snooze 3 days"
                className="px-2 py-1 rounded-md text-2xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors">
                +3d
              </button>
              <button onClick={clear} disabled={isPending} title="Clear"
                className="ml-auto p-1 rounded text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {completed && (
            <p className="text-2xs text-muted-foreground">
              Completed {new Date(nextActionCompletedAt!).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </>
      )}
    </div>
  )
}
