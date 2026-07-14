'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase 39A — Prospecting schedule editor. A weekly grid where the LO chooses,
// per weekday, which board(s) their call queue pulls from (plus an optional
// target), and toggles strict vs. backfill. Smart scoring still ranks within
// the chosen pool — this only picks the pool.
// ─────────────────────────────────────────────────────────────────────────

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Target, ArrowLeft, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { saveProspectingSchedule } from './actions'
import {
  WEEKDAY_LABELS, emptyDaySchedule,
  type ProspectingSchedule, type DayMode, type DaySchedule,
} from './types'

type BoardOpt = { id: string; name: string }

const MODES: { key: DayMode; label: string; hint: string }[] = [
  { key: 'any', label: 'Any board', hint: 'Score across your whole pipeline' },
  { key: 'boards', label: 'Specific boards', hint: 'Pull only from the boards you pick' },
  { key: 'off', label: 'Off', hint: 'No calling queue this day' },
]

export function ScheduleEditor({
  organizationId, initial, boards,
}: {
  organizationId: string
  initial: ProspectingSchedule
  boards: BoardOpt[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [pending, startTransition] = useTransition()
  const [enabled, setEnabled] = useState(initial.enabled)
  const [strict, setStrict] = useState(initial.strict)
  const [week, setWeek] = useState<Record<number, DaySchedule>>(() => {
    const w: Record<number, DaySchedule> = {}
    for (let d = 0; d < 7; d++) w[d] = initial.week[d] ?? emptyDaySchedule()
    return w
  })

  const setDay = (d: number, patch: Partial<DaySchedule>) =>
    setWeek((prev) => ({ ...prev, [d]: { ...prev[d], ...patch } }))

  const toggleBoard = (d: number, boardId: string) =>
    setWeek((prev) => {
      const cur = prev[d]
      const has = cur.boardIds.includes(boardId)
      return {
        ...prev,
        [d]: { ...cur, boardIds: has ? cur.boardIds.filter((x) => x !== boardId) : [...cur.boardIds, boardId] },
      }
    })

  const save = () => {
    startTransition(async () => {
      const res = await saveProspectingSchedule(organizationId, { enabled, strict, week })
      if ('error' in res) { toast.error('Could not save schedule — try again.'); return }
      toast.success('Prospecting schedule saved')
      router.refresh()
    })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/prospecting" className="flex h-9 w-9 items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground" aria-label="Back to prospecting">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jubo-navy/10"><Target className="h-4.5 w-4.5 text-jubo-navy" /></div>
        <div>
          <h1 className="text-lg font-semibold text-foreground">Prospecting schedule</h1>
          <p className="text-xs text-muted-foreground">Choose which boards feed your call queue on each day of the week.</p>
        </div>
      </div>

      {/* Master switches */}
      <section className="space-y-4 rounded-xl border border-border bg-card p-5">
        <Toggle
          label="Use my schedule"
          hint="When off, your queue scores across every board (the default)."
          checked={enabled}
          onChange={setEnabled}
        />
        <Toggle
          label="Strict mode"
          hint="Only show people from the scheduled boards. When off, a thin day backfills with your next-best leads so you're never idle."
          checked={strict}
          onChange={setStrict}
          disabled={!enabled}
        />
      </section>

      {/* Week grid */}
      <section className={cn('space-y-3', !enabled && 'pointer-events-none opacity-50')}>
        {WEEKDAY_LABELS.map((label, d) => {
          const day = week[d]
          return (
            <div key={d} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="w-24 flex-shrink-0 text-sm font-semibold text-foreground">{label}</span>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {MODES.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setDay(d, { mode: m.key })}
                      title={m.hint}
                      className={cn(
                        'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                        day.mode === m.key ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {day.mode === 'boards' && (
                <div className="mt-3 space-y-3 border-t border-border pt-3">
                  {boards.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No boards yet — create a board first.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {boards.map((b) => {
                        const on = day.boardIds.includes(b.id)
                        return (
                          <button
                            key={b.id}
                            onClick={() => toggleBoard(d, b.id)}
                            className={cn(
                              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                              on ? 'bg-jubo-navy/10 text-jubo-navy' : 'bg-surface-2 text-muted-foreground hover:text-foreground',
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                            {b.name}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    Target calls
                    <input
                      type="number"
                      min={0}
                      value={day.target ?? ''}
                      onChange={(e) => setDay(d, { target: e.target.value === '' ? null : Math.max(0, parseInt(e.target.value, 10) || 0) })}
                      placeholder="—"
                      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm text-foreground"
                    />
                    <span className="text-muted-foreground/70">used as the backfill floor</span>
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={save}
          disabled={pending}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Save schedule'}
        </button>
      </div>
    </div>
  )
}

function Toggle({
  label, hint, checked, onChange, disabled,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4', disabled && 'opacity-50')}>
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-surface-3',
          disabled && 'cursor-not-allowed',
        )}
      >
        <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}
