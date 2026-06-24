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
      'rounded-xl border bg-jubo-navy p-3 space-y-2 text-white',
      overdue ? 'border-jubo-red/50' : completed ? 'border-jubo-green/40' : 'border-jubo-navy2',
      compact && 'p-2.5 space-y-1.5',
    )}>
      <div className="flex items-center gap-1.5">
        <Zap className={cn('w-3.5 h-3.5', overdue ? 'text-red-300' : completed ? 'text-jubo-green' : 'text-jubo-gold')} />
        <p className="text-2xs font-semibold uppercase tracking-wider text-jubo-gold flex-1">Next Step</p>
        {nextAction && !editing && !completed && (
          <button onClick={() => setEditing(true)} title="Edit"
            className="p-0.5 rounded text-white/50 hover:text-white hover:bg-white/10">
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
            className="w-full px-2.5 py-1.5 rounded-md bg-jubo-navy2 border border-white/15 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-jubo-red"
          />
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-white/50 flex-shrink-0" />
            <input
              type="datetime-local"
              value={dueLocal}
              onChange={e => setDueLocal(e.target.value)}
              className="flex-1 px-2 py-1 rounded bg-jubo-navy2 border border-white/15 text-2xs text-white focus:outline-none focus:ring-1 focus:ring-jubo-red"
            />
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={save}
              disabled={!text.trim() || isPending}
              className="flex-1 px-2 py-1 rounded-md bg-jubo-red text-white text-2xs font-medium hover:bg-jubo-red-dark disabled:opacity-50 transition-colors"
            >
              {isPending ? 'Saving…' : 'Save'}
            </button>
            {nextAction && (
              <button
                onClick={() => { setEditing(false); setText(nextAction); setDueLocal(isoToLocal(nextActionDueAt)) }}
                className="px-2 py-1 rounded-md text-2xs text-white/60 hover:text-white hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <p className={cn('text-sm font-medium', completed ? 'line-through text-white/50' : 'text-white')}>
            {nextAction}
          </p>
          {nextActionDueAt && (
            <div className={cn('flex items-center gap-1 text-2xs',
              overdue ? 'text-red-300' : 'text-jubo-gold-soft/70'
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
                className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-jubo-red text-white text-2xs font-medium hover:bg-jubo-red-dark disabled:opacity-50 transition-colors">
                <Check className="w-2.5 h-2.5" />
                Complete
              </button>
              <button onClick={() => snooze(1)} disabled={isPending} title="Snooze 1 day"
                className="px-2 py-1 rounded-md text-2xs text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                +1d
              </button>
              <button onClick={() => snooze(3)} disabled={isPending} title="Snooze 3 days"
                className="px-2 py-1 rounded-md text-2xs text-white/70 hover:text-white hover:bg-white/10 transition-colors">
                +3d
              </button>
              <button onClick={clear} disabled={isPending} title="Clear"
                className="ml-auto p-1 rounded text-white/50 hover:text-red-300 hover:bg-white/10 transition-colors">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}
          {completed && (
            <p className="text-2xs text-white/50">
              Completed {new Date(nextActionCompletedAt!).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </p>
          )}
        </>
      )}
    </div>
  )
}
