'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Sunrise, CheckCircle2, Clock, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Plus, Target, ChevronRight, ListChecks, RefreshCw, X, CheckCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DailyActionItem } from './DailyActionItem'
import { ManualActionModal } from './ManualActionModal'
import { StreakCard } from './StreakCard'
import { SnoozeMenu } from './SnoozeMenu'
import { AttentionPanel } from '../attention/AttentionPanel'
import { PRIORITY_RANK } from '../types'
import {
  bulkCompleteDailyActions, bulkSnoozeDailyActions, bulkDeleteDailyActions,
  regenerateDailyActions,
} from '../actions'
import type { DailyActionRow, DailyMetricPace, TodaySummary, DailyProgressStatus } from '../types'
import type { StreakData } from '../progress/streaks'
import type { AttentionView } from '../attention/queries'
import { SetupChecklist } from '@/features/onboarding/setup/SetupChecklist'
import type { SetupChecklistItemRow } from '@/features/onboarding/types'
import { CoachingStrip } from '@/features/mortgage/coaching/CoachingStrip'

interface Props {
  organizationId: string
  organizationName: string
  todayISO: string
  actions: DailyActionRow[]
  summary: TodaySummary
  paces: DailyMetricPace[]
  staleRecords: Array<{ id: string; title: string; board_id: string; updated_at: string }>
  attentionViews: AttentionView[]
  streak: StreakData
  productionGoals: Array<{ id: string; name: string }>
  recordBoardMap: Record<string, string>
  lastUpdatedAt: string                // ISO timestamp for "last updated" label
  setupChecklist?: SetupChecklistItemRow[]   // shown until the LO finishes activation
  followUpsDue?: number                // communication follow-ups due today (coaching)
  callsToday?: number                  // prospecting calls logged today (coaching)
  callGoal?: number                    // daily call goal (coaching)
  connectionRate?: number              // today connection rate 0..1 (coaching)
  sessionActive?: boolean              // a prospecting session is live (coaching)
  coachInsights?: { text: string; tone: 'good' | 'warn' | 'urgent' | 'info'; icon: string }[]  // Phase 24 business-coach lines
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
  actions, summary, paces, staleRecords, attentionViews, streak,
  productionGoals, recordBoardMap, lastUpdatedAt, setupChecklist, followUpsDue, callsToday, callGoal,
  connectionRate, sessionActive, coachInsights,
}: Props) {
  const router = useRouter()
  const [showManual, setShowManual] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [isRegenerating, startRegenerate] = useTransition()
  const [, startBulk] = useTransition()

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelected(new Set())

  const sortedActions = useMemo(() => {
    return [...actions].sort((a, b) => {
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

  // ── Bulk handlers ─────────────────────────────────────────────────────────
  const selectedIds = Array.from(selected)
  const selectedOpen   = selectedIds.filter(id => actions.find(a => a.id === id && !a.completed_at)).length
  const selectedDone   = selectedIds.length - selectedOpen

  const doBulk = (op: () => Promise<unknown>) => {
    startBulk(async () => {
      try { await op(); clearSelection(); router.refresh() }
      catch { /* surface later */ }
    })
  }

  const bulkComplete = () => doBulk(() => bulkCompleteDailyActions(selectedIds, true))
  const bulkReopen   = () => doBulk(() => bulkCompleteDailyActions(selectedIds, false))
  const bulkSnooze   = (dueDate: string) => doBulk(() => bulkSnoozeDailyActions(selectedIds, dueDate))
  const bulkDelete   = () => {
    if (!confirm(`Remove ${selectedIds.length} action${selectedIds.length === 1 ? '' : 's'}?`)) return
    doBulk(() => bulkDeleteDailyActions(selectedIds))
  }

  const handleRegenerate = () => {
    startRegenerate(async () => {
      try { await regenerateDailyActions(); router.refresh() }
      catch { /* silent */ }
    })
  }

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
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating}
              title="Regenerate actions from tasks + goal pacing"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-surface-1 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={cn('w-3 h-3', isRegenerating && 'animate-spin')} />
              <span>Regenerate</span>
            </button>
            <button
              onClick={() => setShowManual(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New action
            </button>
          </div>
        </div>
        <p className="text-2xs text-muted-foreground/70 mt-2">
          Last updated {relativeTime(lastUpdatedAt)}
        </p>
      </header>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 pb-24">

        {/* Setup activation — shown until every checklist item is complete */}
        {setupChecklist && setupChecklist.some(i => !i.completed) && (
          <SetupChecklist items={setupChecklist} compact />
        )}

        {/* Daily coaching — synthesizes pacing + attention + execution */}
        <CoachingStrip
          summary={{ total: summary.total, completed: summary.completed, open: summary.open, paceStatus: summary.paceStatus }}
          paces={paces.map(p => ({ goal_name: p.goal_name, status: p.status, pace_percent: p.pace_percent, daily_target: p.daily_target }))}
          staleCount={staleRecords.length}
          attentionViews={attentionViews.map(v => ({ count: v.count }))}
          followUpsDue={followUpsDue}
          callsToday={callsToday}
          callGoal={callGoal}
          connectionRate={connectionRate}
          sessionActive={sessionActive}
          coachInsights={coachInsights}
        />

        {/* Progress strip */}
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <ProgressCard label="Actions today" value={summary.total} sub={`${summary.completed} done · ${summary.open} open`} accent="bg-primary/10 text-primary" icon={ListChecks} />
          <ProgressCard label="Completed" value={summary.completed} sub={summary.total > 0 ? `${Math.round((summary.completed / summary.total) * 100)}%` : '—'} accent="bg-emerald-500/15 text-emerald-400" icon={CheckCircle2} />
          <ProgressCard label="Overdue" value={summary.overdue} sub={summary.overdue > 0 ? 'Clear these first' : 'Clean'} accent={summary.overdue > 0 ? 'bg-red-500/15 text-red-400' : 'bg-surface-2 text-muted-foreground'} icon={AlertTriangle} />
          <ProgressCard label="Goal pace" value={paceHeadline(summary.paceStatus)} sub={paces.length > 0 ? `${paces.length} goal${paces.length !== 1 ? 's' : ''} tracked` : 'No goals yet'} accent={cn(STATUS_BG[summary.paceStatus], STATUS_COLOR[summary.paceStatus], 'border')} icon={paceIcon(summary.paceStatus)} />
          <StreakCard data={streak} />
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Focus column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Top priorities */}
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Top Priorities</h2>
                {openActions.length > 0 && (
                  <span className="text-2xs text-muted-foreground">{Math.min(3, openActions.length)} of {openActions.length}</span>
                )}
              </div>
              {topPriorities.length === 0 ? (
                <EmptyHint
                  title={summary.total === 0 ? 'No actions yet today' : 'Top priorities cleared'}
                  body={summary.total === 0
                    ? 'Click Regenerate to pull from tasks + pacing, or add an action manually.'
                    : 'Everything urgent is done. Move to your full list below.'}
                />
              ) : (
                <div className="space-y-2">
                  {topPriorities.map(a => (
                    <DailyActionItem
                      key={a.id}
                      action={a}
                      recordLink={recordLinkFor(a, recordBoardMap)}
                      selected={selected.has(a.id)}
                      onToggleSelect={() => toggleSelect(a.id)}
                      selectionMode={selected.size > 0}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Bucketed list */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Today&apos;s Focus</h2>
                <span className="text-2xs text-muted-foreground">{openActions.length} open · {completedActions.length} done</span>
              </div>

              {openActions.length === 0 && completedActions.length === 0 ? (
                <EmptyHint
                  title="Nothing scheduled today"
                  body="Open tasks + behind-pace goals get pulled in automatically. Try Regenerate, or add a manual action."
                />
              ) : (
                <>
                  <BucketGroup title="Urgent" icon={AlertTriangle} accent="text-red-400"
                    actions={urgentActions} recordBoardMap={recordBoardMap}
                    selected={selected} onToggle={toggleSelect} />
                  <BucketGroup title="Today" icon={Clock} accent="text-amber-400"
                    actions={todayActions} recordBoardMap={recordBoardMap}
                    selected={selected} onToggle={toggleSelect} />
                  <BucketGroup title="Later" icon={ListChecks} accent="text-muted-foreground"
                    actions={laterActions} recordBoardMap={recordBoardMap}
                    selected={selected} onToggle={toggleSelect} />

                  {completedActions.length > 0 && (
                    <details className="group">
                      <summary className="cursor-pointer list-none flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <ChevronRight className="w-3 h-3 group-open:rotate-90 transition-transform" />
                        Completed today ({completedActions.length})
                      </summary>
                      <div className="space-y-2 mt-2 pl-4">
                        {completedActions.map(a => (
                          <DailyActionItem
                            key={a.id}
                            action={a}
                            recordLink={recordLinkFor(a, recordBoardMap)}
                            selected={selected.has(a.id)}
                            onToggleSelect={() => toggleSelect(a.id)}
                            selectionMode={selected.size > 0}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </>
              )}
            </section>
          </div>

          {/* Right column */}
          <div className="space-y-6">
            <section className="space-y-2">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <Target className="w-3 h-3" />
                Daily Target
              </h2>
              {paces.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">
                    No production goals with conversion assumptions yet.{' '}
                    <Link href="/goals" className="text-primary hover:underline">Set one up</Link>.
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
              <AttentionPanel views={attentionViews} staleRecords={staleRecords} />
            </section>
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 max-w-[calc(100%-2rem)]">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-card shadow-2xl">
            <span className="text-xs font-medium text-foreground tabular-nums px-1">
              {selected.size} selected
            </span>
            <span className="text-2xs text-muted-foreground hidden md:inline">
              {selectedOpen} open · {selectedDone} done
            </span>
            <div className="h-4 w-px bg-border mx-1" />
            {selectedOpen > 0 && (
              <button
                onClick={bulkComplete}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
              >
                <CheckCheck className="w-3 h-3" />
                Complete
              </button>
            )}
            {selectedDone > 0 && (
              <button
                onClick={bulkReopen}
                className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              >
                Reopen
              </button>
            )}
            <SnoozeMenu onPick={bulkSnooze} label="Snooze" />
            <button
              onClick={bulkDelete}
              className="px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-red-400 hover:bg-surface-2 transition-colors"
            >
              Remove
            </button>
            <div className="h-4 w-px bg-border mx-1" />
            <button
              onClick={clearSelection}
              className="p-1 rounded text-muted-foreground hover:text-foreground"
              title="Clear selection"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

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

function EmptyHint({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-5 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{body}</p>
    </div>
  )
}

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
  title, icon: Icon, accent, actions, recordBoardMap, selected, onToggle,
}: {
  title: string
  icon: React.ElementType
  accent: string
  actions: DailyActionRow[]
  recordBoardMap: Record<string, string>
  selected: Set<string>
  onToggle: (id: string) => void
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
          <DailyActionItem
            key={a.id}
            action={a}
            recordLink={recordLinkFor(a, recordBoardMap)}
            selected={selected.has(a.id)}
            onToggleSelect={() => onToggle(a.id)}
            selectionMode={selected.size > 0}
          />
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

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 30)   return 'just now'
  if (diff < 60)   return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(iso).toLocaleString()
}

function recordLinkFor(action: DailyActionRow, recordBoardMap: Record<string, string>): string | null {
  if (!action.record_id) return null
  const boardId = recordBoardMap[action.record_id]
  return boardId ? `/boards/${boardId}` : null
}
