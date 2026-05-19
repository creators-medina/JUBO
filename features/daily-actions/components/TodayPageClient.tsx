'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Sunrise, Zap, CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Plus, Target, ChevronRight, ListChecks,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DailyActionItem } from './DailyActionItem'
import { ManualActionModal } from './ManualActionModal'
import { PRIORITY_RANK } from '../types'
import type { DailyActionRow, DailyMetricPace, TodaySummary, DailyProgressStatus } from '../types'

interface Props {
  organizationId: string
  organizationName: string
  todayISO: string
  actions: DailyActionRow[]
  summary: TodaySummary
  paces: DailyMetricPace[]
  staleRecords: Array<{ id: string; title: string; board_id: string; updated_at: string }>
  productionGoals: Array<{ id: string; name: string }>
  recordBoardMap: Record<string, string>     // record_id → board_id, for "open" links
}

const STATUS_COLOR: Record<DailyProgressStatus, string> = {
  ahead:   'text-emerald-400',
  on_pace: 'text-amber-400',
  behind:  'text-red-400',
  unknown: 'text-muted-foreground',
}

const STATUS_BG: Record<DailyProgressStatus, string> = {
  ahead:   'bg-emerald-500/15 border-emerald-500/30',
  on_pace: 'bg-amber-500/15 border-amber-500/30',
  behind:  'bg-red-500/15 border-red-500/30',
  unknown: 'bg-surface-2 border-border',
}

export function TodayPageClient({
  organizationId, organizationName, todayISO,
  actions, summary, paces, staleRecords, productionGoals, recordBoardMap,
}: Props) {
  const [showManual, setShowManual] = useState(false)

  // Bucket actions: urgent priority first, then by due date, then created order.
  const sortedActions = useMemo(() => {
    return [...actions].sort((a, b) => {
      // Open actions first
      const completedA = a.completed_at ? 1 : 0
      const completedB = b.completed_at ? 1 : 0
      if (completedA !== completedB) return completedA - completedB
      const pa = PRIORITY_RANK[a.priority] ?? 99
      const pb = PRIORITY_RANK[b.priority] ?? 99
      if (pa !== pb) return pa - pb
      return a.due_date.localeCompare(b.due_date)
    })
  }, [actions])

  const openActions = sortedActions.filter(a => !a.completed_at)
  const completedActions = sortedActions.filter(a => a.completed_at)

  const urgentActions = openActions.filter(a => a.priority === 'urgent' || a.priority === 'high')
  const todayActions  = openActions.filter(a =>
    a.priority !== 'urgent' && a.priority !== 'high' && a.due_date <= todayISO,
  )
  const laterActions  = openActions.filter(a => a.due_date > todayISO)

  const topPriorities = openActions.slice(0, 3)

  const headerDate = new Date(todayISO + 'T00:00:00Z').toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <header className="px-6 py-5 border-b border-border flex-shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sunrise className="w-5 h-5 text-primary" />
              <h1 className="text-xl font-semibold text-foreground tracking-tight">Win the Day</h1>
            </div>
            <p className="text-xs text-muted-foreground">{headerDate} · {organizationName}</p>
            <p className={cn('text-sm font-medium mt-2', STATUS_COLOR[summary.paceStatus])}>
              {summary.paceLabel}
            </p>
          </div>
          <button
            onClick={() => setShowManual(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            New action
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* Progress strip */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ProgressCard label="Actions today" value={summary.total} sub={`${summary.completed} done · ${summary.open} open`} accent="bg-primary/10 text-primary" icon={ListChecks} />
          <ProgressCard label="Completed" value={summary.completed} sub={summary.total > 0 ? `${Math.round((summary.completed / summary.total) * 100)}%` : '—'} accent="bg-emerald-500/15 text-emerald-400" icon={CheckCircle2} />
          <ProgressCard label="Overdue" value={summary.overdue} sub={summary.overdue > 0 ? 'Clear these first' : 'Clean'} accent={summary.overdue > 0 ? 'bg-red-500/15 text-red-400' : 'bg-surface-2 text-muted-foreground'} icon={AlertTriangle} />
          <ProgressCard label="Goal pace" value={paceHeadline(summary.paceStatus)} sub={paces.length > 0 ? `${paces.length} goal${paces.length !== 1 ? 's' : ''} tracked` : 'No goals yet'} accent={cn(STATUS_BG[summary.paceStatus], STATUS_COLOR[summary.paceStatus], 'border')} icon={paceIcon(summary.paceStatus)} />
          <ProgressCard label="Streak" value="—" sub="Coming soon" accent="bg-surface-2 text-muted-foreground" icon={Zap} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Focus column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Top priorities */}
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Priorities</h2>
              {topPriorities.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center">
                  <p className="text-sm text-foreground">Nothing critical right now.</p>
                  <p className="text-xs text-muted-foreground mt-1">Use &quot;New action&quot; to plan your day.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topPriorities.map(a => (
                    <DailyActionItem key={a.id} action={a} recordLink={recordLinkFor(a, recordBoardMap)} />
                  ))}
                </div>
              )}
            </section>

            {/* Daily action list — grouped by bucket */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today&apos;s Focus</h2>
                <span className="text-2xs text-muted-foreground">{openActions.length} open · {completedActions.length} done</span>
              </div>

              <BucketGroup title="Urgent" icon={AlertTriangle} accent="text-red-400" actions={urgentActions} recordBoardMap={recordBoardMap} />
              <BucketGroup title="Today"  icon={Clock}          accent="text-amber-400" actions={todayActions}  recordBoardMap={recordBoardMap} />
              <BucketGroup title="Later"  icon={ListChecks}     accent="text-muted-foreground" actions={laterActions}  recordBoardMap={recordBoardMap} />

              {completedActions.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer list-none flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                    Completed today ({completedActions.length})
                  </summary>
                  <div className="space-y-2 mt-2 pl-4">
                    {completedActions.map(a => (
                      <DailyActionItem key={a.id} action={a} recordLink={recordLinkFor(a, recordBoardMap)} />
                    ))}
                  </div>
                </details>
              )}
            </section>
          </div>

          {/* Right column: goal pace + attention */}
          <div className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3 h-3" />
                Daily Target
              </h2>
              {paces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">
                    No production goals with conversion assumptions yet. <Link href="/goals" className="text-primary hover:underline">Set one up</Link>.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {paces.map(p => <PaceCard key={`${p.production_goal_id}-${p.metric_key}`} pace={p} />)}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                Needs Attention
              </h2>
              {staleRecords.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Nothing stale. Records are fresh.</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {staleRecords.map(r => (
                    <Link
                      key={r.id}
                      href={`/boards/${r.board_id}`}
                      className="block px-3 py-2 rounded-lg border border-border bg-card hover:bg-surface-1 transition-colors group"
                    >
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary">{r.title}</p>
                      <p className="text-2xs text-muted-foreground mt-0.5">
                        Last touched {relativeDays(r.updated_at)}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      </div>

      {showManual && (
        <ManualActionModal
          organizationId={organizationId}
          productionGoals={productionGoals}
          defaultDate={todayISO}
          onClose={() => setShowManual(false)}
        />
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ProgressCard({
  label, value, sub, accent, icon: Icon,
}: {
  label: string
  value: number | string
  sub: string
  accent: string
  icon: React.ElementType
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', accent)}>
          <Icon className="w-3 h-3" />
        </span>
      </div>
      <p className="text-xl font-semibold text-foreground tabular-nums">{value}</p>
      <p className="text-2xs text-muted-foreground truncate">{sub}</p>
    </div>
  )
}

function BucketGroup({
  title, icon: Icon, accent, actions, recordBoardMap,
}: {
  title: string
  icon: React.ElementType
  accent: string
  actions: DailyActionRow[]
  recordBoardMap: Record<string, string>
}) {
  if (actions.length === 0) return null
  return (
    <div className="space-y-1.5">
      <div className={cn('flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider', accent)}>
        <Icon className="w-3 h-3" />
        {title}
        <span className="text-muted-foreground">· {actions.length}</span>
      </div>
      <div className="space-y-2">
        {actions.map(a => (
          <DailyActionItem key={a.id} action={a} recordLink={recordLinkFor(a, recordBoardMap)} />
        ))}
      </div>
    </div>
  )
}

function PaceCard({ pace }: { pace: DailyMetricPace }) {
  const fill = Math.max(0, Math.min(100, pace.pace_percent))
  const StatusIcon = pace.status === 'ahead' ? TrendingUp : pace.status === 'behind' ? TrendingDown : Minus
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-foreground truncate">{pace.goal_name}</p>
          <p className="text-2xs text-muted-foreground uppercase tracking-wider mt-0.5">{pace.metric_label}</p>
        </div>
        <span className={cn('inline-flex items-center gap-1 text-2xs font-medium', STATUS_COLOR[pace.status])}>
          <StatusIcon className="w-3 h-3" />
          {Math.round(pace.pace_percent)}%
        </span>
      </div>
      <div className="h-1 rounded-full bg-surface-2 overflow-hidden">
        <div className={cn('h-full rounded-full transition-all',
          pace.status === 'ahead'   ? 'bg-emerald-400/70' :
          pace.status === 'on_pace' ? 'bg-amber-400/70'   :
          pace.status === 'behind'  ? 'bg-red-400/70'     : 'bg-muted-foreground/40',
        )} style={{ width: `${fill}%` }} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-2xs">
        <Mini label="Daily"   value={formatPace(pace.daily_target)} />
        <Mini label="Weekly"  value={formatPace(pace.weekly_target)} />
        <Mini label="Monthly" value={formatPace(pace.monthly_target)} />
      </div>
    </div>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground uppercase tracking-wider">{label}</p>
      <p className="text-foreground font-medium tabular-nums">{value}</p>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatPace(n: number): string {
  if (!Number.isFinite(n)) return '—'
  if (n < 1) return n.toFixed(2)
  return Math.ceil(n).toLocaleString()
}

function paceHeadline(status: DailyProgressStatus): string {
  if (status === 'ahead')   return 'Ahead'
  if (status === 'on_pace') return 'On pace'
  if (status === 'behind')  return 'Behind'
  return '—'
}

function paceIcon(status: DailyProgressStatus): React.ElementType {
  if (status === 'ahead')   return TrendingUp
  if (status === 'behind')  return TrendingDown
  return Minus
}

function relativeDays(updatedAt: string): string {
  const diff = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86_400_000)
  if (diff < 1) return 'today'
  if (diff < 2) return '1 day ago'
  return `${diff} days ago`
}

function recordLinkFor(action: DailyActionRow, recordBoardMap: Record<string, string>): string | null {
  if (!action.record_id) return null
  const boardId = recordBoardMap[action.record_id]
  return boardId ? `/boards/${boardId}` : null
}
