'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import * as Icons from 'lucide-react'
import {
  PhoneCall, PhoneOff, Voicemail, CalendarClock, CalendarCheck, ThumbsUp,
  Play, Square, ArrowUpRight, History, Clock, DollarSign, TrendingUp, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { PremiumSurface } from '@/components/primitives/PremiumSurface'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { useToast } from '@/features/feedback/ToastProvider'
import { quickCallOutcome } from '@/features/communications/actions'
import { PhoneActions } from '@/features/communications/components/PhoneActions'
import { isConnect, isBookedAppointment } from '@/features/communications/outcomes'
import { track } from '@/features/analytics/client'
import { TrackView } from '@/features/analytics/TrackView'
import { OUTCOME_LABEL, type CommunicationOutcome } from '@/features/communications/types'
import { startProspectingSession, endProspectingSession } from '../sessions/actions'
import type {
  ScoredLead, ProspectingMetrics, SessionRow, LiveSessionStats, LeadTemperature,
  QueueBucketKey, PeriodCallTargets, ProspectingStreak, ContactedTodayItem,
} from '../types'
import { TAG_CHIP_CLASS, type ContactTag } from '../themeBuckets'
import { ThemeDayCockpit } from '../themeday/ThemeDayCockpit'
import type { ThemeDayData } from '../themeday/queues'
import type { CoachLine } from '../coaching'

function Icon({ name, className }: { name: string; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name] ?? Icons.Sparkles
  return <C className={className} />
}

const TEMP_STYLE: Record<LeadTemperature, { label: string; cls: string; dot: string; badge: string }> = {
  hot:     { label: 'Hot', cls: 'text-jubo-red', dot: 'bg-jubo-red', badge: 'bg-jubo-red/10 text-jubo-red' },
  warm:    { label: 'Warm', cls: 'text-jubo-gold', dot: 'bg-jubo-gold', badge: 'bg-jubo-gold-soft text-jubo-gold' },
  cold:    { label: 'Cold', cls: 'text-jubo-navy', dot: 'bg-jubo-navy', badge: 'bg-jubo-navy/10 text-jubo-navy' },
  dormant: { label: 'Dormant', cls: 'text-muted-foreground', dot: 'bg-surface-3', badge: 'bg-surface-2 text-muted-foreground' },
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
  { outcome: 'connected',          label: 'Connected', key: 'C', icon: PhoneCall,     tone: 'text-jubo-green' },
  { outcome: 'interested',         label: 'Interested', key: 'I', icon: ThumbsUp,      tone: 'text-jubo-green' },
  { outcome: 'booked_appointment', label: 'Booked',    key: 'B', icon: CalendarCheck, tone: 'text-jubo-navy' },
  { outcome: 'no_answer',          label: 'No answer', key: 'N', icon: PhoneOff },
  { outcome: 'voicemail',          label: 'Voicemail', key: 'V', icon: Voicemail },
  { outcome: 'follow_up_needed',   label: 'Follow-up', key: 'F', icon: CalendarClock, tone: 'text-jubo-gold' },
]
const KEY_OUTCOME: Record<string, CommunicationOutcome> = {
  c: 'connected', i: 'interested', b: 'booked_appointment',
  n: 'no_answer', v: 'voicemail', f: 'follow_up_needed',
}

export function ProspectingCockpit({
  organizationId, queue, metrics, session, liveStats, themeData, coaching, callGoal, targetLabel, targets, streak, contactedToday, followUpsDue, sessions,
}: {
  organizationId: string
  queue: ScoredLead[]
  metrics: ProspectingMetrics
  session: SessionRow | null
  liveStats: LiveSessionStats | null
  themeData: ThemeDayData
  coaching: CoachLine[]
  callGoal: number
  targetLabel: string
  targets: PeriodCallTargets
  streak: ProspectingStreak
  contactedToday: ContactedTodayItem[]
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

  // ── Lender Theme Days ──
  // Per-weekday call goals saved by the earlier goal editor still inform the
  // session target — localStorage v1, read-only here (SSR-safe hydrate).
  const [themeGoals, setThemeGoals] = useState<Record<number, number>>({})
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(THEME_GOALS_KEY)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setThemeGoals(JSON.parse(raw) as Record<number, number>)
    } catch { /* defaults stand */ }
  }, [])
  const todayDow = new Date().getDay()
  // Today's effective goal: LO's saved theme goal, else the server target.
  const todayGoal = themeGoals[todayDow] ?? callGoal

  const visible = useMemo(
    () => queue.filter((l) => !worked.has(l.recordId) && (bucket === 'all' || l.bucket === bucket)),
    [queue, worked, bucket],
  )

  // Reset the selection index on bucket change (dependent-state reset — must be
  // an effect responding to the bucket change, not render-time derivation).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelectedIndex(0) }, [bucket])
  const sel = Math.min(selectedIndex, Math.max(0, visible.length - 1))

  const logOutcome = useCallback((recordId: string, outcome: CommunicationOutcome) => {
    if (workedRef.current.has(recordId)) return   // already logged/skipped — no double-log
    workedRef.current.add(recordId)
    track('prospecting_outcome', { outcome })
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <TrackView surface="prospecting" />

      <div className="flex flex-1 overflow-hidden">
        {/* Main scroll column */}
        <div className="flex-1 overflow-y-auto">
          <div className="space-y-5 p-6">

            {/* ── Theme Day cockpit (Prospecting Redesign): navy hero + week
                strip + today's call list, driven by the real source boards. ── */}
            <ThemeDayCockpit data={themeData} streak={streak} organizationId={organizationId} goal={todayGoal} goalSource={targetLabel} />

            {/* ── Session + today snapshot (kept from the previous cockpit) ── */}
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <SessionControl organizationId={organizationId} session={session} liveStats={liveStats} pending={pending} startTransition={startTransition} router={router} callGoal={todayGoal} />
              <div className="grid flex-1 grid-cols-2 gap-2 sm:max-w-md sm:grid-cols-4">
                <HeroStat label="Connects" value={metrics.connectsToday} />
                <HeroStat label="Connect rate" value={`${Math.round(metrics.connectionRate * 100)}%`} />
                <HeroStat label="Appts booked" value={metrics.meetingsBookedToday} accent={metrics.meetingsBookedToday > 0} />
                <HeroStat label="Follow-ups due" value={followUpsDue} warn={followUpsDue > 0} />
              </div>
            </div>

            {/* ── Momentum: Today / Week / Month / Year ── */}
            <section>
              <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
                Momentum <span className="ml-1 normal-case text-muted-foreground/60">· {targetLabel}</span>
              </h2>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <MomentumCard label="Today" completed={metrics.callsToday} goal={targets.daily} />
                <MomentumCard label="Week" completed={metrics.callsThisWeek} goal={targets.weekly} />
                <MomentumCard label="Month" completed={metrics.callsThisMonth} goal={targets.monthly} />
                <MomentumCard label="Year" completed={metrics.callsThisYear} goal={targets.yearly} />
              </div>
            </section>

            {/* ── Why this matters: goal/pace tie-in ── */}
            <PaceCard targets={targets} />

            {/* ── Contacted today ── */}
            <ContactedToday items={contactedToday} onOpen={openWorkspace} />

            {/* ── Prospecting queue ── */}
            <section>
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
                  <p className="mt-3 text-sm font-medium text-foreground">You&apos;re clear for now</p>
                  <p className="mt-1 text-xs text-muted-foreground">Add leads or import a call list to keep the momentum going.</p>
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
            </section>
          </div>
        </div>

        {/* Side panel — motivation, week stats, session history */}
        <aside className="hidden w-72 flex-shrink-0 flex-col gap-4 overflow-y-auto border-l border-border bg-surface-1/30 p-5 lg:flex">
          <div>
            <h2 className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Win the day</h2>
            <div className="space-y-2">
              {coaching.map((l, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Icon name={l.icon} className={cn('mt-0.5 h-3.5 w-3.5 flex-shrink-0', coachTone(l.tone))} />
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

const THEME_GOALS_KEY = 'jubo-theme-call-goals:v1'
function coachTone(tone: CoachLine['tone']): string {
  return tone === 'good' ? 'text-jubo-green' : tone === 'warn' ? 'text-jubo-gold' : tone === 'urgent' ? 'text-jubo-red' : 'text-muted-foreground'
}

function HeroStat({ label, value, accent, warn }: { label: string; value: number | string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="premium-card rounded-lg px-3 py-2">
      <p className={cn('text-lg font-semibold tabular-nums', warn ? 'text-jubo-gold' : accent ? 'text-jubo-green' : 'text-foreground')}>{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  )
}

function MomentumCard({ label, completed, goal }: { label: string; completed: number; goal: number }) {
  const pct = goal > 0 ? Math.min(100, Math.round((completed / goal) * 100)) : 0
  const done = goal > 0 && completed >= goal
  const inner = (
    <>
      <div className="flex items-center justify-between">
        <span className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className={cn('text-2xs font-semibold tabular-nums', done ? 'text-jubo-green' : 'text-muted-foreground')}>{pct}%</span>
      </div>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">
        {completed.toLocaleString()}
        <span className="text-xs font-normal text-muted-foreground"> / {goal.toLocaleString()}</span>
      </p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className={cn('h-full rounded-full transition-all duration-700 ease-out', done ? 'bg-jubo-green' : 'bg-primary')} style={{ width: `${pct}%` }} />
      </div>
    </>
  )
  // Goal-achievement state earns the premium achievement frame.
  return done ? (
    <PremiumSurface tone="achievement" className="rounded-xl bg-card p-3">{inner}</PremiumSurface>
  ) : (
    <div className="premium-card rounded-xl p-3">{inner}</div>
  )
}

// ── Goal/pace tie-in (Priority 6) ──
function PaceCard({ targets }: { targets: PeriodCallTargets }) {
  const prod = targets.production
  const plan = prod
    ? prod.incomeTarget != null
      ? ` — keeping you on pace for your ${prod.name} ($${prod.incomeTarget.toLocaleString()} plan).`
      : ` — keeping you on pace for your ${prod.name}.`
    : '.'
  return (
    <PremiumSurface className="rounded-xl bg-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-jubo-navy/10 text-jubo-navy">
          <TrendingUp className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Why this matters</p>
          <p className="mt-0.5 text-sm text-foreground">
            Today&apos;s <span className="font-semibold tabular-nums">{targets.daily}</span> calls build toward{' '}
            <span className="font-semibold tabular-nums">{targets.weekly.toLocaleString()}</span> this week,{' '}
            <span className="font-semibold tabular-nums">{targets.monthly.toLocaleString()}</span> this month, and{' '}
            <span className="font-semibold tabular-nums">{targets.yearly.toLocaleString()}</span> this year{plan}
          </p>
          <Link href="/business-plan" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            View business plan <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>
      </div>
    </PremiumSurface>
  )
}

// ── Contacted today (Priority 3) ──
function ContactedToday({ items, onOpen }: { items: ContactedTodayItem[]; onOpen: (t: { recordId: string; title: string }) => void }) {
  const MAX = 6
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5" /> Contacted today
        {items.length > 0 && <span className="tabular-nums text-muted-foreground/60">· {items.length}</span>}
      </h2>
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-8 text-center">
          <p className="text-sm font-medium text-foreground">No calls logged yet</p>
          <p className="mt-1 text-xs text-muted-foreground">Make your first call to start today&apos;s progress.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {items.slice(0, MAX).map((it, i) => {
            const b = outcomeBadge(it.channel, it.outcome)
            return (
              <div key={`${it.recordId}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-jubo-green" />
                  <button onClick={() => onOpen({ recordId: it.recordId, title: it.title })} className="truncate text-sm text-foreground hover:underline">{it.title}</button>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className={cn('rounded-full px-1.5 py-0.5 text-2xs font-medium', b.cls)}>{b.label}</span>
                  <span className="text-2xs tabular-nums text-muted-foreground">{formatTime(it.occurredAt)}</span>
                </div>
              </div>
            )
          })}
          {items.length > MAX && (
            <p className="px-3 py-2 text-2xs text-muted-foreground">+{items.length - MAX} more contacted today</p>
          )}
        </div>
      )}
    </section>
  )
}

function outcomeBadge(channel: string, outcome: string | null): { label: string; cls: string } {
  const label = outcome ? (OUTCOME_LABEL[outcome as CommunicationOutcome] ?? outcome) : channel
  if (isBookedAppointment(channel, outcome)) return { label, cls: 'bg-jubo-navy/10 text-jubo-navy' }
  if (isConnect(outcome)) return { label, cls: 'bg-jubo-green-soft text-jubo-green' }
  if (outcome === 'no_answer' || outcome === 'voicemail' || outcome === 'left_message' || outcome === 'follow_up_needed') {
    return { label, cls: 'bg-jubo-gold-soft text-jubo-gold' }
  }
  return { label, cls: 'bg-surface-2 text-muted-foreground' }
}

function SessionControl({ organizationId, session, liveStats, pending, startTransition, router, callGoal }: {
  organizationId: string; session: SessionRow | null; liveStats: LiveSessionStats | null
  pending: boolean; startTransition: React.TransitionStartFunction; router: ReturnType<typeof useRouter>; callGoal: number
}) {
  if (session && liveStats) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-jubo-navy/30 bg-jubo-navy/10 px-3 py-2">
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

function LeadCard({ lead, selected, pending, onSelect, onLog, onSkip, onOpen, tags }: {
  lead: ScoredLead; selected: boolean; pending: boolean
  onSelect: () => void
  onLog: (recordId: string, outcome: CommunicationOutcome) => void
  onSkip: () => void
  onOpen: () => void
  /** Derived category chips ("why shown") — from existing board/stage/type data. */
  tags?: ContactTag[]
}) {
  const t = TEMP_STYLE[lead.temperature]
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { if (selected) ref.current?.scrollIntoView({ block: 'nearest' }) }, [selected])

  // Overdue is driven by the server-side queue scoring (overdue_followups
  // bucket = a next action past due), keeping render pure.
  const overdue = lead.bucket === 'overdue_followups'

  return (
    <div ref={ref} onMouseEnter={onSelect}
      className={cn('rounded-xl border bg-card p-3.5 transition-all',
        selected ? 'border-primary/50 ring-1 ring-primary/20 shadow-sm' : overdue ? 'border-jubo-red/30' : 'border-border')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {/* Name + temperature + overdue */}
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={onOpen} className="truncate text-sm font-semibold text-foreground hover:underline">{lead.title}</button>
            <span className={cn('inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-2xs font-medium', t.badge)}>
              <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} /> {t.label}
            </span>
            {(tags ?? []).map((t) => (
              <span key={t.key} className={cn('rounded-full px-1.5 py-0.5 text-2xs font-medium', TAG_CHIP_CLASS[t.key])}>{t.label}</span>
            ))}
            {overdue && <span className="rounded bg-jubo-red/10 px-1.5 py-0.5 text-2xs font-semibold text-jubo-red">Overdue</span>}
            {selected && <span className="rounded bg-jubo-navy/15 px-1.5 py-0.5 text-2xs font-medium text-jubo-navy">Next</span>}
          </div>

          {/* Last contact + value */}
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {lastContactLabel(lead.daysSinceContact)}</span>
            {lead.loanAmount ? (
              <span className="inline-flex items-center gap-1"><DollarSign className="h-3 w-3" /> {lead.loanAmount.toLocaleString()}</span>
            ) : null}
          </div>

          {/* Why this person is surfacing */}
          {lead.reasons.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {lead.reasons.slice(0, 3).map((r, i) => (
                <span key={i} className="rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs text-foreground/80">{r}</span>
              ))}
            </div>
          ) : lead.groupName ? (
            <p className="mt-1.5 truncate text-2xs text-muted-foreground">{lead.groupName}</p>
          ) : null}
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
  if (sessions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-surface-1 p-3 text-center">
        <p className="text-xs font-medium text-foreground">No sessions yet</p>
        <p className="mt-0.5 text-2xs text-muted-foreground">Start a session to track today&apos;s momentum.</p>
      </div>
    )
  }
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
              <span className={cn('flex-shrink-0 text-2xs font-medium', hit ? 'text-jubo-green' : 'text-muted-foreground')}>
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

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </div>
  )
}

function lastContactLabel(days: number | null): string {
  if (days == null) return 'Never contacted'
  if (days <= 0) return 'Last contact today'
  if (days === 1) return 'Last contact 1 day ago'
  return `Last contact ${days} days ago`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
function durationLabel(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime()
  const mins = Math.max(0, Math.floor(ms / 60000))
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}
