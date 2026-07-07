'use client'

// ─────────────────────────────────────────────────────────────────────────
// Theme Day cockpit — the Prospecting Dashboard redesign (high-fidelity
// reference: Prospecting_Redesign PDF). Dark navy hero (Today label, theme
// title, pulled-from chips, playbook, progress ring, streak / to-go, Next Up
// card), a Mon–Fri week strip with mini rings, and the collapsible today's
// list with a green Log-call dropdown per row.
//
// Data honesty:
// • Queues are FULL rosters of the theme's real source boards (queues.ts);
//   missing boards are reported, never faked.
// • Call outcomes log through the EXISTING quickCallOutcome action → real
//   communication_logs rows (permanent CRM history, drives streak/metrics).
//   No telephony, no SMS/email — logging only.
// • Completion state = this user's real call logs today. "Reset day" and
//   per-row undo are NON-DESTRUCTIVE: they store a per-browser reset
//   timestamp (localStorage) that hides earlier logs from the dashboard
//   view only — no CRM data is ever deleted.
// • Priority chips show the REAL records.priority value (Urgent/High);
//   Hot/Warm/Cold is not a stored field, so it is never invented.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PhoneCall, PhoneOff, Voicemail, CalendarClock, CalendarCheck, ThumbsUp,
  Phone, Mail, Clock, Flame, ChevronDown, ChevronUp, RotateCcw, ArrowUpRight,
  CheckCircle2, Columns3,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { quickCallOutcome } from '@/features/communications/actions'
import { OUTCOME_LABEL, type CommunicationOutcome } from '@/features/communications/types'
import { track } from '@/features/analytics/client'
import { getWeekThemeDays } from '../coaching/themeDay'
import type { ProspectingStreak } from '../types'
import type { ThemeDayData, ThemeCallItem, ThemeDayQueue } from './queues'

// ── Log-call outcomes (per redesign spec) ──
type OutcomeTone = 'win' | 'neutral' | 'amber'
const LOG_OUTCOMES: { outcome: CommunicationOutcome; label: string; icon: React.ElementType; tone: OutcomeTone }[] = [
  { outcome: 'connected',          label: 'Connected', icon: PhoneCall,     tone: 'win' },
  { outcome: 'interested',         label: 'Interested', icon: ThumbsUp,     tone: 'win' },
  { outcome: 'booked_appointment', label: 'Booked',    icon: CalendarCheck, tone: 'win' },
  { outcome: 'no_answer',          label: 'No answer', icon: PhoneOff,      tone: 'neutral' },
  { outcome: 'voicemail',          label: 'Voicemail', icon: Voicemail,     tone: 'neutral' },
  { outcome: 'follow_up_needed',   label: 'Follow-up', icon: CalendarClock, tone: 'amber' },
]
const OUTCOME_TONE: Partial<Record<string, OutcomeTone>> = Object.fromEntries(LOG_OUTCOMES.map((o) => [o.outcome, o.tone]))
const OUTCOME_SHORT: Partial<Record<string, string>> = Object.fromEntries(LOG_OUTCOMES.map((o) => [o.outcome, o.label]))

const EMPTY_MSG: Record<number, string> = {
  1: 'No Realtor/Agent contacts found for Monday.',
  2: 'No active or inactive loan files found for Tuesday.',
  3: 'No pre-approved contacts found for Wednesday.',
  4: 'No past clients found for Thursday.',
  5: 'No VIPs found for Friday.',
}

/** Honest theme default plays (stage-aware only for Tuesday's board kind). */
function playFor(weekday: number, item: ThemeCallItem): string {
  switch (weekday) {
    case 1: return 'call and ask for the business'
    case 2: return item.boardKind === 'inactive' ? 'reconnect and revive the file' : 'update file status and ask for a referral'
    case 3: return 'follow up on pre-approval and ask for the business'
    case 4: return 'check in and invite to client appreciation'
    case 5: return 'relationship call and ask for the business'
    default: return 'make the call'
  }
}

// ── Non-destructive per-day reset (localStorage, per-browser) ──
type DayResets = { all?: string; byRecord: Record<string, string> }
const resetKey = (dateKey: string) => `jubo-theme-day-reset:v1:${dateKey}`
function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Timer-based tween (setInterval — per the prototype, no requestAnimationFrame). */
function useTweenedPercent(target: number): number {
  const [val, setVal] = useState(0)
  const fromRef = useRef(0)
  useEffect(() => {
    const from = fromRef.current
    const delta = target - from
    if (Math.abs(delta) < 0.5) {
      fromRef.current = target
      setVal(target)
      return
    }
    const STEPS = 24
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      const eased = 1 - Math.pow(1 - i / STEPS, 3)
      if (i >= STEPS) {
        window.clearInterval(id)
        fromRef.current = target
        setVal(target)
      } else {
        setVal(from + delta * eased)
      }
    }, 25)
    return () => window.clearInterval(id)
  }, [target])
  return val
}

export function ThemeDayCockpit({ data, streak }: { data: ThemeDayData; streak: ProspectingStreak }) {
  const router = useRouter()
  const toast = useToast()
  const { openWorkspace } = useWorkspaceTabs()
  const [pending, startTransition] = useTransition()

  const rawDow = new Date().getDay()
  // Weekend default → Monday (existing app convention for theme days).
  const todayDow = rawDow >= 1 && rawDow <= 5 ? rawDow : 1
  const [selectedDow, setSelectedDow] = useState(todayDow)
  const [collapsed, setCollapsed] = useState(false)

  // Optimistic local logs (merged with the server's real logs until refresh).
  const [localLogs, setLocalLogs] = useState<Map<string, { outcome: string; occurredAt: string }>>(new Map())
  const inFlight = useRef<Set<string>>(new Set())

  // Today's dashboard-only reset marks (per-browser; never deletes CRM data).
  const todayKey = localDateKey(new Date())
  const [resets, setResets] = useState<DayResets>({ byRecord: {} })
  useEffect(() => {
    try {
      // Prune reset marks from previous days so storage doesn't accumulate
      // (each day's marks are only meaningful on that day).
      for (let i = window.localStorage.length - 1; i >= 0; i--) {
        const k = window.localStorage.key(i)
        if (k && k.startsWith('jubo-theme-day-reset:v1:') && k !== resetKey(todayKey)) {
          window.localStorage.removeItem(k)
        }
      }
      const raw = window.localStorage.getItem(resetKey(todayKey))
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setResets(JSON.parse(raw) as DayResets)
    } catch { /* no saved resets */ }
  }, [todayKey])
  const saveResets = (next: DayResets) => {
    setResets(next)
    try { window.localStorage.setItem(resetKey(todayKey), JSON.stringify(next)) } catch { /* view-only anyway */ }
  }

  const week = useMemo(() => getWeekThemeDays(), [])
  const selDay = week.find((d) => d.weekday === selectedDow) ?? week[0]
  const theme = selDay.theme
  const queue: ThemeDayQueue = data.days[selectedDow] ?? { weekday: selectedDow, boards: [], missingBoards: [], items: [] }
  // Actionable day (logging enabled) — on weekends this maps to Monday.
  const isToday = selectedDow === todayDow
  // The selected weekday IS the actual calendar weekday (false on weekends,
  // where Monday is shown "up next" rather than mislabeled as today).
  const isActualToday = selectedDow === rawDow

  // Completion per day: the user's real call logs on that calendar date.
  // Today additionally merges optimistic logs and applies the local resets.
  // MEMOIZED and computed for all five days at once — this must NOT run per
  // render: the log array can be large, and recomputing it on every render
  // (including every ring-tween frame, six times over) blocked the main
  // thread and made the whole dashboard unresponsive.
  const calledByDay = useMemo(() => {
    const out = new Map<number, Map<string, { outcome: string | null; occurredAt: string }>>()
    // Parse each log's local date key and timestamp exactly once.
    const logs = data.weekLogs.map((l) => ({
      recordId: l.recordId,
      outcome: l.outcome,
      occurredAt: l.occurredAt,
      dateKey: localDateKey(new Date(l.occurredAt)),
      ts: Date.parse(l.occurredAt),
    }))
    const resetAtFor = (id: string): number | null => {
      const iso = resets.byRecord[id] ?? resets.all
      return iso ? Date.parse(iso) : null
    }
    for (const d of week) {
      const weekday = d.weekday
      const ids = new Set((data.days[weekday]?.items ?? []).map((i) => i.recordId))
      const actionable = weekday === todayDow
      const dateKey = actionable ? todayKey : localDateKey(d.date)
      const best = new Map<string, { outcome: string | null; occurredAt: string; ts: number }>()
      for (const log of logs) {
        if (log.dateKey !== dateKey || !ids.has(log.recordId)) continue
        const prev = best.get(log.recordId)
        if (!prev || log.ts > prev.ts) best.set(log.recordId, { outcome: log.outcome, occurredAt: log.occurredAt, ts: log.ts })
      }
      const map = new Map<string, { outcome: string | null; occurredAt: string }>()
      for (const [id, l] of best) map.set(id, { outcome: l.outcome, occurredAt: l.occurredAt })
      if (actionable) {
        for (const [id, l] of localLogs) if (ids.has(id)) map.set(id, l)
        // Apply dashboard-only resets: entries logged before the reset don't count.
        for (const [id, l] of [...map]) {
          const resetAt = resetAtFor(id)
          if (resetAt != null && Date.parse(l.occurredAt) <= resetAt) map.delete(id)
        }
      }
      out.set(weekday, map)
    }
    return out
  }, [data, week, todayDow, todayKey, localLogs, resets])

  const EMPTY_CALLED = useMemo(() => new Map<string, { outcome: string | null; occurredAt: string }>(), [])
  const called = calledByDay.get(selectedDow) ?? EMPTY_CALLED

  const uncalled = queue.items.filter((i) => !called.has(i.recordId))
  const done = queue.items.length - uncalled.length
  const goal = queue.items.length
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0
  const win = goal > 0 && done >= goal
  const nextUp = uncalled[0] ?? null
  const toGo = Math.max(0, goal - done)
  const ordered = [...uncalled, ...queue.items.filter((i) => called.has(i.recordId))]

  const logCall = (recordId: string, outcome: CommunicationOutcome) => {
    if (inFlight.current.has(recordId)) return
    inFlight.current.add(recordId)
    track('prospecting_outcome', { outcome, surface: 'theme_day' })
    const at = new Date().toISOString()
    setLocalLogs((m) => new Map(m).set(recordId, { outcome, occurredAt: at }))
    startTransition(async () => {
      const res = await quickCallOutcome(recordId, outcome)
      inFlight.current.delete(recordId)
      if (res && 'error' in res) {
        setLocalLogs((m) => { const n = new Map(m); n.delete(recordId); return n })
        toast.error('Could not log the call — try again.')
        return
      }
      toast.success(`Logged ${OUTCOME_LABEL[outcome]}`)
      router.refresh()
    })
  }

  /** Per-row undo — dashboard-only: the CRM call log stays; the row returns
   *  to uncalled for today's list in this browser. */
  const undoRow = (recordId: string) => {
    setLocalLogs((m) => { const n = new Map(m); n.delete(recordId); return n })
    saveResets({ ...resets, byRecord: { ...resets.byRecord, [recordId]: new Date().toISOString() } })
  }

  /** Reset day — dashboard-only: clears today's completion view. No CRM
   *  records, notes, tasks, or call history are deleted. */
  const resetDay = () => {
    setLocalLogs(new Map())
    saveResets({ all: new Date().toISOString(), byRecord: {} })
  }

  const dateLabel = `${selDay.date.toLocaleDateString(undefined, { weekday: 'long' })}, ${selDay.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`

  return (
    <section className="space-y-4">
      {/* ── Navy hero ── */}
      <div className="rounded-2xl bg-jubo-navy p-6 text-white shadow-md sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/55">
            {isActualToday ? 'Today' : isToday ? 'Up next' : 'This week'} · {dateLabel}
          </p>
          {isToday && (
            <button
              onClick={resetDay}
              title="Clears today's dashboard progress only — no CRM records or call history are deleted."
              className="flex-shrink-0 rounded-lg border border-white/20 px-2.5 py-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Reset day
            </button>
          )}
        </div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{theme.label}</h1>

        {/* Pulled-from board chips — real matched boards; missing ones reported. */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Pulled from</span>
          {queue.boards.map((b) => (
            <Link key={b.id} href={`/boards/${b.id}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/15">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D96B57]" aria-hidden /> {b.name}
            </Link>
          ))}
          {queue.missingBoards.map((name) => (
            <span key={name} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-white/25 px-2.5 py-1 text-xs text-white/50">
              {name} — not found
            </span>
          ))}
        </div>

        {/* Today's playbook */}
        {theme.guidance.length > 0 && (
          <div className="mt-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Today&apos;s playbook</p>
            {/* Horizontal row that wraps — compact, like the reference. */}
            <div className="mt-2 flex flex-wrap gap-x-7 gap-y-1.5">
              {theme.guidance.map((g, i) => (
                <span key={i} className="inline-flex items-start gap-2 text-[13px] text-white/85">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#E8B3A5]" aria-hidden /> {g}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Ring + streak/to-go + Next Up */}
        <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-8">
          <div className="flex flex-shrink-0 flex-col items-center gap-3.5">
            <HeroRing percent={pct} done={done} goal={goal} pill={`${pct}%${isActualToday ? ' today' : ''}`} />
            <div className="flex items-center gap-5">
              <div className="text-center">
                <p className="flex items-center justify-center gap-1 text-xl font-bold tabular-nums">
                  <Flame className="h-4 w-4 text-jubo-gold" aria-hidden /> {streak.current}
                </p>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">Day streak</p>
              </div>
              <div className="h-8 w-px bg-white/15" aria-hidden />
              <div className="text-center">
                <p className="text-xl font-bold tabular-nums">{toGo}</p>
                <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/50">To go</p>
              </div>
            </div>
          </div>

          <div className="min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.05] p-4 sm:p-6">
            {win ? (
              <div className="py-2 text-center lg:text-left">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#E8B3A5]">Day complete</p>
                <p className="mt-1 text-2xl font-bold text-[#E8B3A5]">You won today <span aria-hidden>🎉</span></p>
                <p className="mt-1 text-sm text-white/70">Every {theme.shortLabel.toLowerCase()} contact is logged. Anything more is a bonus.</p>
              </div>
            ) : nextUp ? (
              <>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Next up</p>
                <button onClick={() => openWorkspace({ recordId: nextUp.recordId, title: nextUp.title })}
                  className="mt-0.5 block max-w-full truncate text-xl font-bold text-white hover:underline">
                  {nextUp.title}
                </button>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <PriorityChip priority={nextUp.priority} onDark />
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 text-2xs font-medium text-white/85">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#D96B57]" aria-hidden /> {nextUp.boardName}
                  </span>
                  {nextUp.stage && <span className="text-xs text-white/60">{nextUp.stage}</span>}
                </div>
                <ContactMetaLine item={nextUp} onDark />
                <p className="mt-2 text-sm text-white/75">
                  The play: <span className="font-semibold text-white">{playFor(selectedDow, nextUp)}</span>
                </p>
                {isToday && (
                  <div className="mt-3">
                    <LogCallDropdown disabled={pending} onSelect={(o) => logCall(nextUp.recordId, o)} />
                  </div>
                )}
              </>
            ) : (
              /* Empty Next Up — same card, same place, layout stays balanced. */
              <div className="flex min-h-[9.5rem] flex-col justify-center">
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Next up</p>
                {queue.boards.length === 0 ? (
                  <>
                    <p className="mt-1 text-lg font-bold text-white/90">No call list for this day yet</p>
                    <p className="mt-1 text-sm text-white/60">
                      Source {queue.missingBoards.length === 1 ? 'board' : 'boards'} not found:{' '}
                      <span className="font-semibold text-white/85">{queue.missingBoards.join(', ')}</span>.
                    </p>
                    <Link href="/boards"
                      className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/85 transition-colors hover:bg-white/10">
                      View boards <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-lg font-bold text-white/90">{EMPTY_MSG[selectedDow]}</p>
                    <p className="mt-1 text-sm text-white/60">
                      Add contacts to {queue.boards.map((b) => b.name).join(' or ')} and they&apos;ll appear here as your next call.
                    </p>
                    <Link href={`/boards/${queue.boards[0].id}`}
                      className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/25 px-3 py-1.5 text-xs font-semibold text-white/85 transition-colors hover:bg-white/10">
                      Open {queue.boards[0].name} <ArrowUpRight className="h-3 w-3" />
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Mon–Fri week strip ── */}
      <div className="overflow-x-auto">
        <div className="grid min-w-[600px] grid-cols-5 gap-3">
          {week.map((d) => {
            const dayCalled = calledByDay.get(d.weekday) ?? EMPTY_CALLED
            const dayQueue = data.days[d.weekday]?.items ?? []
            const dayDone = dayQueue.filter((i) => dayCalled.has(i.recordId)).length
            const dayGoal = dayQueue.length
            const active = d.weekday === selectedDow
            // Badge only on the true calendar day (no badge on weekends).
            const today = d.weekday === rawDow
            return (
              <button key={d.weekday} onClick={() => setSelectedDow(d.weekday)}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl border bg-card px-3 pb-3 pt-2 shadow-sm transition-colors',
                  active ? 'border-jubo-navy ring-1 ring-jubo-navy' : 'border-border hover:border-jubo-border-strong',
                )}>
                {/* Today badge sits INSIDE the card (never clipped); the fixed
                    slot keeps all five cards the same height. */}
                <span className="flex h-4 items-center">
                  {today && (
                    <span className="rounded-full bg-jubo-red px-2 py-px text-[9px] font-bold uppercase tracking-wider text-white">Today</span>
                  )}
                </span>
                <MiniRing done={dayDone} goal={dayGoal} />
                <p className={cn('mt-0.5 text-[11px] font-bold uppercase tracking-[0.12em]', active ? 'text-jubo-red' : 'text-muted-foreground')}>
                  {d.date.toLocaleDateString(undefined, { weekday: 'short' })}
                </p>
                <p className="max-w-full truncate text-[13px] font-semibold text-foreground">{d.theme.shortLabel}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{dayDone}/{dayGoal}</p>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Today's list ── */}
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <button onClick={() => setCollapsed((c) => !c)}
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left sm:px-5">
          <span className="flex items-center gap-2 text-sm font-bold text-foreground">
            {collapsed ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
            {theme.shortLabel} · {isActualToday ? "today's list" : `${selDay.date.toLocaleDateString(undefined, { weekday: 'long' })} list`}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{done}/{goal} called</span>
        </button>
        <div className="h-1 w-full bg-surface-2">
          <div className="h-full bg-[#B8492C] transition-all duration-500 ease-out" style={{ width: `${pct}%` }} />
        </div>

        {!collapsed && (
          queue.boards.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Columns3 className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">
                Source {queue.missingBoards.length === 1 ? 'board' : 'boards'} not found: {queue.missingBoards.join(', ')}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">Create or rename a board so this theme day has a call list. Nothing is faked.</p>
              <Link href="/boards" className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                View all boards <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          ) : queue.items.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <PhoneCall className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-2 text-sm font-medium text-foreground">{EMPTY_MSG[selectedDow]}</p>
              <p className="mt-1 text-xs text-muted-foreground">Add contacts to {queue.boards.map((b) => b.name).join(' or ')} to build this day&apos;s list.</p>
              <Link href={`/boards/${queue.boards[0].id}`} className="mt-3 inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
                Open {queue.boards[0].name} <ArrowUpRight className="h-3 w-3" />
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-border/70">
              {!isToday && (
                <p className="px-4 py-2 text-2xs text-muted-foreground">
                  Planning view — call logging is available on the day itself. Completion shown is from calls logged that day.
                </p>
              )}
              {ordered.map((item) => {
                const log = called.get(item.recordId)
                return (
                  <CallRow key={item.recordId} item={item} weekday={selectedDow}
                    log={log ?? null} actionable={isToday} pending={pending}
                    onLog={(o) => logCall(item.recordId, o)}
                    onUndo={() => undoRow(item.recordId)}
                    onOpen={() => openWorkspace({ recordId: item.recordId, title: item.title })} />
                )
              })}
            </div>
          )
        )}
      </div>
    </section>
  )
}

// ── Hero progress ring (SVG) ──
// The timer tween lives INSIDE the ring so its ~24 frames re-render only this
// small component — never the whole cockpit (that render storm, multiplied by
// the per-day completion scans, is what froze the dashboard).
function HeroRing({ percent, done, goal, pill }: { percent: number; done: number; goal: number; pill: string }) {
  const tweened = useTweenedPercent(percent)
  const size = 176, stroke = 13
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * (Math.max(0, Math.min(100, tweened)) / 100)
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <defs>
          <linearGradient id="jubo-theme-ring" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D96B57" />
            <stop offset="100%" stopColor="#9E2F1F" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#jubo-theme-ring)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${dash} ${c - dash}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-bold tabular-nums">{done}</span>
        <span className="text-xs text-white/60">of {goal} called</span>
        <span className="mt-1.5 rounded-full bg-white/10 px-2 py-0.5 text-2xs font-semibold text-[#E8B3A5]">{pill}</span>
      </div>
    </div>
  )
}

function MiniRing({ done, goal }: { done: number; goal: number }) {
  const size = 68, stroke = 5.5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const pct = goal > 0 ? Math.min(1, done / goal) : 0
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 text-surface-2">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#B8492C" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={`${c * pct} ${c * (1 - pct)}`} className="transition-all duration-500" />
      </svg>
      <span className="absolute text-lg font-bold tabular-nums text-foreground">{done}</span>
    </div>
  )
}

// ── Green Log-call dropdown (click-outside dismiss; no telephony) ──
function LogCallDropdown({ disabled, onSelect, compact }: {
  disabled?: boolean
  onSelect: (o: CommunicationOutcome) => void
  compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block">
      <button disabled={disabled} onClick={() => setOpen((o) => !o)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg bg-[#B8492C] font-semibold text-white shadow-sm transition-colors hover:bg-[#96351F] disabled:opacity-50',
          compact ? 'px-2.5 py-1.5 text-xs' : 'px-3.5 py-2 text-sm',
        )}>
        <Phone className={compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} /> Log call <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-44 rounded-lg border border-border bg-card py-1 shadow-lg">
          {LOG_OUTCOMES.map((o) => (
            <button key={o.outcome}
              onClick={() => { setOpen(false); onSelect(o.outcome) }}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs font-medium text-foreground transition-colors hover:bg-surface-2">
              <o.icon className={cn('h-3.5 w-3.5',
                o.tone === 'win' ? 'text-[#B8492C]' : o.tone === 'amber' ? 'text-jubo-gold' : 'text-muted-foreground')} />
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Queue row ──
function CallRow({ item, weekday, log, actionable, pending, onLog, onUndo, onOpen }: {
  item: ThemeCallItem
  weekday: number
  log: { outcome: string | null; occurredAt: string } | null
  actionable: boolean
  pending: boolean
  onLog: (o: CommunicationOutcome) => void
  onUndo: () => void
  onOpen: () => void
}) {
  const logged = log != null
  return (
    <div className={cn('px-4 py-3.5 sm:px-5', logged && 'opacity-60')}>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-jubo-gold-soft text-xs font-bold text-jubo-gold">
          {initials(item.title)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <button onClick={onOpen} className="max-w-full truncate text-sm font-bold text-foreground hover:underline">{item.title}</button>
            <PriorityChip priority={item.priority} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-medium text-foreground/80">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D96B57]" aria-hidden /> {item.boardName}
            </span>
          </div>
          {item.stage && <p className="mt-0.5 text-xs text-muted-foreground">{item.stage}</p>}
          <ContactMetaLine item={item} />
          <p className="mt-1.5 inline-flex max-w-full items-baseline gap-1.5 rounded-md bg-surface-2/80 px-2 py-1 text-2xs text-foreground/80">
            <span className="font-bold uppercase tracking-wider text-muted-foreground">Play</span>
            <span className="truncate">{playFor(weekday, item)}</span>
          </p>
          {actionable && !logged && (
            <div className="mt-2">
              <LogCallDropdown compact disabled={pending} onSelect={onLog} />
            </div>
          )}
        </div>
        {logged && (
          <div className="flex flex-shrink-0 items-center gap-1.5">
            <OutcomeBadge outcome={log.outcome} />
            {actionable && (
              <button onClick={onUndo} title="Mark as not called (dashboard only — the CRM call log is kept)"
                className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function OutcomeBadge({ outcome }: { outcome: string | null }) {
  const tone = outcome ? OUTCOME_TONE[outcome] : undefined
  const label = outcome ? (OUTCOME_SHORT[outcome] ?? OUTCOME_LABEL[outcome as CommunicationOutcome] ?? outcome) : 'Logged'
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-2xs font-semibold',
      tone === 'win' ? 'bg-[#E8B3A5]/40 text-[#96351F]'
        : tone === 'amber' ? 'bg-jubo-gold-soft text-jubo-gold'
        : 'bg-surface-2 text-muted-foreground')}>
      {label}
    </span>
  )
}

/** REAL records.priority only (urgent/high get a chip; others are neutral). */
function PriorityChip({ priority, onDark }: { priority: string | null; onDark?: boolean }) {
  if (priority === 'urgent') {
    return <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', onDark ? 'bg-jubo-red/30 text-red-200' : 'bg-jubo-red/10 text-jubo-red')}>Urgent</span>
  }
  if (priority === 'high') {
    return <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider', onDark ? 'bg-jubo-gold/25 text-jubo-gold-soft' : 'bg-jubo-gold-soft text-jubo-gold')}>High</span>
  }
  return null
}

function ContactMetaLine({ item, onDark }: { item: ThemeCallItem; onDark?: boolean }) {
  const parts: React.ReactNode[] = []
  if (item.phone) parts.push(<span key="p" className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {item.phone}</span>)
  if (item.email) parts.push(<span key="e" className="inline-flex min-w-0 items-center gap-1"><Mail className="h-3 w-3 flex-shrink-0" /> <span className="truncate">{item.email}</span></span>)
  parts.push(
    <span key="lc" className="inline-flex items-center gap-1">
      <Clock className="h-3 w-3" /> Last contact: {relativeLabel(item.lastContactAt)}
    </span>,
  )
  return (
    <div className={cn('mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs', onDark ? 'text-white/60' : 'text-muted-foreground')}>
      {parts}
    </div>
  )
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '—'
}

function relativeLabel(iso: string | null): string {
  if (!iso) return '—'
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 14) return `${days} days ago`
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  if (days < 365) return `${Math.floor(days / 30)} months ago`
  return `${Math.floor(days / 365)}y ago`
}
