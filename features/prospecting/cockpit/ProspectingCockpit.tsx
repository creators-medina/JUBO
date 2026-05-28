'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Icons from 'lucide-react'
import {
  PhoneCall, PhoneOff, Voicemail, CalendarClock, CalendarCheck, ThumbsUp,
  Play, Square, Flame, ArrowUpRight, History,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { useToast } from '@/features/feedback/ToastProvider'
import { quickCallOutcome } from '@/features/communications/actions'
import { PhoneActions } from '@/features/communications/components/PhoneActions'
import { OUTCOME_LABEL, type CommunicationOutcome } from '@/features/communications/types'
import { startProspectingSession, endProspectingSession } from '../sessions/actions'
import type { ScoredLead, ProspectingMetrics, SessionRow, LiveSessionStats, LeadTemperature, QueueBucketKey } from '../types'
import type { ThemeDay } from '../coaching/themeDay'
import type { CoachLine } from '../coaching'

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Sparkles
  return <C className={className} />
}

const TEMP_STYLE: Record<LeadTemperature, { label: string; cls: string; dot: string }> = {
  hot:     { label: 'Hot', cls: 'text-red-300', dot: 'bg-red-400' },
  warm:    { label: 'Warm', cls: 'text-amber-300', dot: 'bg-amber-400' },
  cold:    { label: 'Cold', cls: 'text-blue-300', dot: 'bg-blue-400' },
  dormant: { label: 'Dormant', cls: 'text-muted-foreground', dot: 'bg-surface-3' },
}

const BUCKETS: { key: QueueBucketKey | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'overdue_followups', label: 'Follow-ups' },
  { key: 'hot', label: 'Hot' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'stale', label: 'Stale' },
  { key: 'partners', label: 'Partners' },
  { key: 'fresh', label: 'Fresh' },
]

type OutcomeBtn = { outcome: CommunicationOutcome; label: string; key: string; icon: React.ElementType; tone?: string }
const OUTCOME_BTNS: OutcomeBtn[] = [
  { outcome: 'connected',          label: 'Connected', key: 'C', icon: PhoneCall,     tone: 'text-emerald-400' },
  { outcome: 'interested',         label: 'Interested', key: 'I', icon: ThumbsUp,      tone: 'text-emerald-400' },
  { outcome: 'booked_appointment', label: 'Booked',    key: 'B', icon: CalendarCheck, tone: 'text-violet-400' },
  { outcome: 'no_answer',          label: 'No answer', key: 'N', icon: PhoneOff },
  { outcome: 'voicemail',          label: 'Voicemail', key: 'V', icon: Voicemail },
  { outcome: 'follow_up_needed',   label: 'Follow-up', key: 'F', icon: CalendarClock, tone: 'text-amber-400' },
]
const KEY_OUTCOME: Record<string, CommunicationOutcome> = {
  c: 'connected', i: 'interested', b: 'booked_appointment',
  n: 'no_answer', v: 'voicemail', f: 'follow_up_needed',
}

export function ProspectingCockpit({
  organizationId, queue, metrics, session, liveStats, themeDay, coaching, callGoal, targetLabel, followUpsDue, sessions,
}: {
  organizationId: string
  queue: ScoredLead[]
  metrics: ProspectingMetrics
  session: SessionRow | null
  liveStats: LiveSessionStats | null
  themeDay: ThemeDay
  coaching: CoachLine[]
  callGoal: number
  targetLabel: string
  followUpsDue: number
  sessions: SessionRow[]
}) {
  const router = useRouter()
  const toast = useToast()
  const { openWorkspace } = useWorkspaceTabs()
  const [pending, startTransition] = useTransition()
  const [worked, setWorked] = useState<Set<string>>(new Set())
  // Synchronous mirror of `worked` so rapid double-presses (or Enter on a
  // focused outcome button + the keydown handler) can't double-log a lead.
  const workedRef = useRef<Set<string>>(new Set())
  const [bucket, setBucket] = useState<QueueBucketKey | 'all'>('all')
  const [selectedIndex, setSelectedIndex] = useState(0)

  const visible = useMemo(
    () => queue.filter((l) => !worked.has(l.recordId) && (bucket === 'all' || l.bucket === bucket)),
    [queue, worked, bucket],
  )

  // Keep the selection in range as the queue shrinks; reset on bucket change.
  useEffect(() => { setSelectedIndex(0) }, [bucket])
  const sel = Math.min(selectedIndex, Math.max(0, visible.length - 1))

  const logOutcome = useCallback((recordId: string, outcome: CommunicationOutcome) => {
    if (workedRef.current.has(recordId)) return   // already logged/skipped — no double-log
    workedRef.current.add(recordId)
    setWorked((s) => new Set(s).add(recordId))    // optimistic removal
    startTransition(async () => {
      const res = await quickCallOutcome(recordId, outcome)
      if (res && 'error' in res) {
        // Roll the optimistic removal back so the lead returns to the queue.
        workedRef.current.delete(recordId)
        setWorked((s) => { const n = new Set(s); n.delete(recordId); return n })
        toast.error('Could not log outcome — try again.')
        return
      }
      toast.success(`Logged ${OUTCOME_LABEL[outcome]}`)
      router.refresh()
    })
  }, [router, toast, startTransition])

  const skip = useCallback((recordId: string) => {
    workedRef.current.add(recordId)
    setWorked((s) => new Set(s).add(recordId))
  }, [])

  // Keyboard-first call flow.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.repeat) return   // holding a key must not fire repeatedly (no duplicate logs)
      const el = document.activeElement as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return
      if (visible.length === 0) return
      const lead = visible[Math.min(sel, visible.length - 1)]
      if (!lead) return
      const key = e.key.toLowerCase()
      if (key === 'arrowdown' || key === 'j') { e.preventDefault(); setSelectedIndex((i) => Math.min(visible.length - 1, i + 1)) }
      else if (key === 'arrowup' || key === 'k') { e.preventDefault(); setSelectedIndex((i) => Math.max(0, i - 1)) }
      else if (key === ' ') { e.preventDefault(); setSelectedIndex((i) => Math.min(visible.length - 1, i + 1)) }
      else if (key === 'o') { e.preventDefault(); openWorkspace({ recordId: lead.recordId, title: lead.title }) }
      else if (key === 'd' && lead.phone) { e.preventDefault(); window.location.href = `tel:${lead.phone}` }
      else if (key === 's') { e.preventDefault(); skip(lead.recordId) }
      else if (key === 'enter') { e.preventDefault(); logOutcome(lead.recordId, 'connected') }
      else if (KEY_OUTCOME[key]) { e.preventDefault(); logOutcome(lead.recordId, KEY_OUTCOME[key]) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [visible, sel, logOutcome, skip, openWorkspace])

  const remaining = Math.max(0, callGoal - metrics.callsToday)
  const goalPct = Math.min(100, Math.round((metrics.callsToday / Math.max(1, callGoal)) * 100))

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Banner */}
      <header className="border-b border-border bg-gradient-to-br from-surface-1 to-card px-6 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Flame className="h-5 w-5 text-primary" />
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{themeDay.label}</h1>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{themeDay.blurb}</p>
          </div>
          <SessionControl organizationId={organizationId} session={session} liveStats={liveStats} pending={pending} startTransition={startTransition} router={router} callGoal={callGoal} />
        </div>

        {/* Metric chips */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Calls today" value={metrics.callsToday} accent />
          <Metric label="Connects" value={metrics.connectsToday} />
          <Metric label="Connect rate" value={`${Math.round(metrics.connectionRate * 100)}%`} />
          <Metric label="Appts booked" value={metrics.meetingsBookedToday} />
          <Metric label="Follow-ups due" value={followUpsDue} />
          <Metric label="To goal" value={remaining} sub={targetLabel} />
        </div>
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${goalPct}%` }} />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Queue */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-3 flex items-center gap-1.5 overflow-x-auto">
            {BUCKETS.map((b) => {
              const count = b.key === 'all' ? queue.filter((l) => !worked.has(l.recordId)).length : queue.filter((l) => l.bucket === b.key && !worked.has(l.recordId)).length
              if (b.key !== 'all' && count === 0) return null
              return (
                <button key={b.key} onClick={() => setBucket(b.key)}
                  className={cn('flex-shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    bucket === b.key ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground hover:text-foreground')}>
                  {b.label} <span className="tabular-nums opacity-70">{count}</span>
                </button>
              )
            })}
          </div>

          {visible.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-16 text-center">
              <PhoneCall className="mx-auto h-8 w-8 text-muted-foreground" />
              <p className="mt-3 text-sm font-medium text-foreground">Queue clear</p>
              <p className="mt-1 text-xs text-muted-foreground">Nothing needs a call in this view. Strong work.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {visible.map((lead, i) => (
                <LeadCard key={lead.recordId} lead={lead} selected={i === sel} pending={pending}
                  onSelect={() => setSelectedIndex(i)}
                  onLog={logOutcome} onSkip={() => skip(lead.recordId)}
                  onOpen={() => openWorkspace({ recordId: lead.recordId, title: lead.title })} />
              ))}
            </div>
          )}

          <KeyboardHints />
        </div>

        {/* Side panel */}
        <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface-1/30 p-5 lg:flex">
          <div>
            <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Coaching</h2>
            <div className="space-y-2">
              {coaching.map((l, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Icon name={l.icon} className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0',
                    l.tone === 'good' ? 'text-emerald-400' : l.tone === 'warn' ? 'text-amber-400' : l.tone === 'urgent' ? 'text-red-400' : 'text-muted-foreground')} />
                  <span className="text-xs text-foreground">{l.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-surface-1 p-3">
            <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">This week</h2>
            <div className="space-y-1.5 text-xs">
              <Row label="Calls" value={metrics.callsThisWeek} />
              <Row label="Connects" value={metrics.connectsThisWeek} />
              <Row label="Connect rate" value={`${Math.round(metrics.connectionRateWeek * 100)}%`} />
              <Row label="Booked" value={metrics.bookedThisWeek} />
              <Row label="Active days" value={metrics.activeDaysThisWeek} />
              <Row label="Best day" value={metrics.bestDayLabel ? `${metrics.bestDayLabel} · ${metrics.bestDayCalls}` : '—'} />
              <Row label="Avg / active day" value={metrics.avgCallsPerActiveDay} />
            </div>
          </div>

          <SessionHistory sessions={sessions} />
        </aside>
      </div>
    </div>
  )
}

function SessionControl({ organizationId, session, liveStats, pending, startTransition, router, callGoal }: {
  organizationId: string; session: SessionRow | null; liveStats: LiveSessionStats | null
  pending: boolean; startTransition: React.TransitionStartFunction; router: ReturnType<typeof useRouter>; callGoal: number
}) {
  if (session && liveStats) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-3 py-2">
        <div className="text-xs">
          <p className="font-medium text-foreground">Session live · {liveStats.attempted}/{session.target_calls || callGoal} calls</p>
          <p className="text-2xs text-muted-foreground">{liveStats.connected} connected · {liveStats.noAnswer} no answer · {liveStats.meetings} booked</p>
        </div>
        <button disabled={pending} onClick={() => startTransition(async () => { await endProspectingSession(session.id); router.refresh() })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-2">
          <Square className="h-3.5 w-3.5" /> End
        </button>
      </div>
    )
  }
  return (
    <button disabled={pending} onClick={() => startTransition(async () => { await startProspectingSession(organizationId, callGoal); router.refresh() })}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
      <Play className="h-4 w-4" /> Start session
    </button>
  )
}

function LeadCard({ lead, selected, pending, onSelect, onLog, onSkip, onOpen }: {
  lead: ScoredLead; selected: boolean; pending: boolean
  onSelect: () => void
  onLog: (recordId: string, outcome: CommunicationOutcome) => void
  onSkip: () => void
  onOpen: () => void
}) {
  const t = TEMP_STYLE[lead.temperature]
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: 'nearest' }) }, [selected])

  return (
    <div ref={ref} onMouseEnter={onSelect}
      className={cn('rounded-xl border bg-card p-3 transition-colors', selected ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', t.dot)} />
            <button onClick={onOpen} className="truncate text-sm font-semibold text-foreground hover:underline">{lead.title}</button>
            <span className={cn('text-2xs font-medium', t.cls)}>{t.label}</span>
            {selected && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-medium text-primary">Next</span>}
          </div>
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">
            {lead.reasons.join(' · ') || lead.groupName || 'In queue'}
            {lead.loanAmount ? ` · $${lead.loanAmount.toLocaleString()}` : ''}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button onClick={onSkip} className="rounded-md px-1.5 py-1 text-2xs text-muted-foreground hover:bg-surface-2 hover:text-foreground" title="Skip (S)">Skip</button>
          <button onClick={onOpen} className="rounded-md p-1 text-muted-foreground hover:text-foreground" title="Open workspace (O)">
            <ArrowUpRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {lead.phone && (
        <div className="mt-2.5">
          <PhoneActions phone={lead.phone} recordId={lead.recordId} compact />
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {OUTCOME_BTNS.map((b) => (
          <OutcomeButton key={b.outcome} icon={b.icon} label={b.label} hint={b.key} tone={b.tone} disabled={pending} onClick={() => onLog(lead.recordId, b.outcome)} />
        ))}
      </div>
    </div>
  )
}

function OutcomeButton({ icon: I, label, hint, tone, disabled, onClick }: { icon: React.ElementType; label: string; hint?: string; tone?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50">
      <I className={cn('h-3.5 w-3.5', tone ?? 'text-muted-foreground')} /> {label}
      {hint && <kbd className="ml-0.5 rounded border border-border bg-surface-2 px-1 text-[10px] leading-none text-muted-foreground">{hint}</kbd>}
    </button>
  )
}

function SessionHistory({ sessions }: { sessions: SessionRow[] }) {
  if (sessions.length === 0) return null
  return (
    <div className="rounded-lg border border-border bg-surface-1 p-3">
      <h2 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        <History className="h-3 w-3" /> Recent sessions
      </h2>
      <div className="space-y-2">
        {sessions.map((s) => {
          const rate = s.attempted_calls > 0 ? Math.round((s.connected_calls / s.attempted_calls) * 100) : 0
          const hit = s.target_calls > 0 && s.attempted_calls >= s.target_calls
          return (
            <div key={s.id} className="flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">{formatDay(s.started_at)} · {durationLabel(s.started_at, s.ended_at)}</p>
                <p className="text-2xs text-muted-foreground">{s.attempted_calls} calls · {rate}% connect · {s.meetings_booked} booked</p>
              </div>
              <span className={cn('flex-shrink-0 text-2xs font-medium', hit ? 'text-emerald-400' : 'text-muted-foreground')}>
                {hit ? 'Goal' : `${s.attempted_calls}/${s.target_calls || '—'}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function KeyboardHints() {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-muted-foreground">
      <span><kbd className="rounded border border-border bg-surface-1 px-1">J</kbd>/<kbd className="rounded border border-border bg-surface-1 px-1">K</kbd> move</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">C</kbd> connected</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">N</kbd> no answer</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">V</kbd> voicemail</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">F</kbd> follow-up</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">B</kbd> booked</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">O</kbd> open</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">D</kbd> dial</span>
      <span><kbd className="rounded border border-border bg-surface-1 px-1">S</kbd> skip</span>
    </div>
  )
}

function Metric({ label, value, sub, accent }: { label: string; value: number | string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2">
      <p className={cn('text-lg font-semibold tabular-nums', accent ? 'text-primary' : 'text-foreground')}>{value}</p>
      <p className="text-2xs text-muted-foreground">{label}{sub ? ` · ${sub}` : ''}</p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function durationLabel(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const mins = Math.max(0, Math.floor(ms / 60000))
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}
