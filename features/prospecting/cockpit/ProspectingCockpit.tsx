'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Icons from 'lucide-react'
import {
  Phone, PhoneCall, PhoneOff, Voicemail, CalendarClock, Play, Square, Flame, ArrowUpRight, Target,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { quickCallOutcome } from '@/features/communications/actions'
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

export function ProspectingCockpit({
  organizationId, queue, metrics, session, liveStats, themeDay, coaching, callGoal, followUpsDue,
}: {
  organizationId: string
  queue: ScoredLead[]
  metrics: ProspectingMetrics
  session: SessionRow | null
  liveStats: LiveSessionStats | null
  themeDay: ThemeDay
  coaching: CoachLine[]
  callGoal: number
  followUpsDue: number
}) {
  const router = useRouter()
  const { openWorkspace } = useWorkspaceTabs()
  const [pending, startTransition] = useTransition()
  const [worked, setWorked] = useState<Set<string>>(new Set())
  const [bucket, setBucket] = useState<QueueBucketKey | 'all'>('all')

  const visible = useMemo(
    () => queue.filter((l) => !worked.has(l.recordId) && (bucket === 'all' || l.bucket === bucket)),
    [queue, worked, bucket],
  )

  const logOutcome = (recordId: string, outcome: 'connected' | 'no_answer' | 'voicemail' | 'follow_up_needed') => {
    setWorked((s) => new Set(s).add(recordId))
    startTransition(async () => {
      await quickCallOutcome(recordId, outcome)
      router.refresh()
    })
  }

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
          <Metric label="To goal" value={remaining} sub={`goal ${callGoal}`} />
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
                <LeadCard key={lead.recordId} lead={lead} isNext={i === 0} pending={pending}
                  onLog={logOutcome} onOpen={() => openWorkspace({ recordId: lead.recordId, title: lead.title })} />
              ))}
            </div>
          )}
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
              <Row label="Avg calls / active day" value={metrics.avgCallsPerActiveDay} />
            </div>
          </div>
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
    <button disabled={pending} onClick={() => startTransition(async () => { await startProspectingSession(organizationId); router.refresh() })}
      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
      <Play className="h-4 w-4" /> Start session
    </button>
  )
}

function LeadCard({ lead, isNext, pending, onLog, onOpen }: {
  lead: ScoredLead; isNext: boolean; pending: boolean
  onLog: (recordId: string, outcome: 'connected' | 'no_answer' | 'voicemail' | 'follow_up_needed') => void
  onOpen: () => void
}) {
  const t = TEMP_STYLE[lead.temperature]
  return (
    <div className={cn('rounded-xl border bg-card p-3 transition-colors', isNext ? 'border-primary/50 ring-1 ring-primary/20' : 'border-border')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', t.dot)} />
            <button onClick={onOpen} className="truncate text-sm font-semibold text-foreground hover:underline">{lead.title}</button>
            <span className={cn('text-2xs font-medium', t.cls)}>{t.label}</span>
            {isNext && <span className="rounded bg-primary/15 px-1.5 py-0.5 text-2xs font-medium text-primary">Next</span>}
          </div>
          <p className="mt-0.5 truncate text-2xs text-muted-foreground">
            {lead.reasons.join(' · ') || lead.groupName || 'In queue'}
            {lead.loanAmount ? ` · $${lead.loanAmount.toLocaleString()}` : ''}
          </p>
        </div>
        <button onClick={onOpen} className="flex-shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground" title="Open workspace">
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <OutcomeBtn icon={PhoneCall} label="Connected" tone="text-emerald-400" disabled={pending} onClick={() => onLog(lead.recordId, 'connected')} />
        <OutcomeBtn icon={PhoneOff} label="No answer" disabled={pending} onClick={() => onLog(lead.recordId, 'no_answer')} />
        <OutcomeBtn icon={Voicemail} label="Voicemail" disabled={pending} onClick={() => onLog(lead.recordId, 'voicemail')} />
        <OutcomeBtn icon={CalendarClock} label="Follow-up" tone="text-amber-400" disabled={pending} onClick={() => onLog(lead.recordId, 'follow_up_needed')} />
      </div>
    </div>
  )
}

function OutcomeBtn({ icon: I, label, tone, disabled, onClick }: { icon: React.ElementType; label: string; tone?: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-surface-2 disabled:opacity-50">
      <I className={cn('h-3.5 w-3.5', tone ?? 'text-muted-foreground')} /> {label}
    </button>
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
