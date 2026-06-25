'use client'

// ─────────────────────────────────────────────────────────────────────────
// LOS Command-Center (parked for Phase C3).
//
// This is the legacy "Overview" loan-file workspace that previously rendered as
// the workspace `overview` tab: a warm cream canvas with the loan/property
// snapshots + conditions (left), the unified timeline + composer (center), and
// the control rail — Next Step, signals, tasks, file team, move-to-stage (right).
//
// Phase C1 collapsed the record card to EXACTLY four tabs (the V2 PersonFileCard),
// so this Command-Center is no longer mounted anywhere. Its CODE is kept here,
// intact, so Phase C3 can harvest its "brains" (snapshots, opportunity signals,
// Next Step, move-to-stage composition) into the four-tab card. Do NOT delete.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useTransition } from 'react'
import { ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ChecklistView } from '../checklist/ChecklistView'
import { NextActionCard } from '../components/NextActionCard'
import { StageTracker } from './StageTracker'
import { ParticipantRibbon } from './ParticipantRibbon'
import { UnifiedTimeline } from './UnifiedTimeline'
import { QualificationSnapshot } from './QualificationSnapshot'
import { LoanSnapshot } from './LoanSnapshot'
import { PropertyCard } from './PropertyCard'
import { MortgageWorkspace, hasMortgageTemplate } from '@/features/mortgage/workspaces/MortgageWorkspace'
import { computeOpportunitySignals } from '@/features/mortgage/scoring/opportunities'
import { resolveWorkspaceTemplate } from '@/features/mortgage/templates/resolve'
import { isChecklistFieldType } from '@/features/fields/checklist'
import { moveRecord } from '@/features/records/actions'
import type { Loaded } from '../components/WorkspacePanel'
import type { TimelineItem } from '../types'

export function LosCommandCenter({
  recordId, data, onChanged, onSubTabChange,
}: {
  recordId: string
  data: Loaded
  onChanged: () => void
  /** Phase C3 will re-wire compose/full-history navigation. */
  onSubTabChange?: (t: string) => void
}) {
  const nav = onSubTabChange ?? (() => {})

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = []
    for (const a of data.activities) {
      items.push({
        id: a.id, type: 'activity', activity_type: a.activity_type,
        timestamp: a.created_at, actor_id: a.user_id,
        actor_name: a.user_id ? (data.profiles[a.user_id] ?? null) : null,
        content: a.content, metadata: a.metadata ?? undefined,
      })
    }
    for (const t of data.tasks) {
      items.push({
        id: `t-${t.id}-c`, type: 'task',
        activity_type: 'task_created', timestamp: t.created_at,
        actor_id: t.created_by, actor_name: t.created_by ? (data.profiles[t.created_by] ?? null) : null,
        content: t.title,
      })
      if (t.completed_at) {
        items.push({
          id: `t-${t.id}-x`, type: 'task',
          activity_type: 'task_completed', timestamp: t.completed_at,
          actor_id: t.assigned_user_id ?? t.created_by,
          actor_name: (t.assigned_user_id ?? t.created_by)
            ? (data.profiles[t.assigned_user_id ?? t.created_by] ?? null)
            : null,
          content: t.title,
        })
      }
    }
    for (const m of data.movements) {
      items.push({
        id: m.id, type: 'movement', activity_type: 'movement',
        timestamp: m.created_at, actor_id: m.user_id,
        actor_name: m.user_id ? (data.profiles[m.user_id] ?? null) : null,
        content: m.from_group?.name && m.to_group?.name
          ? `${m.from_group.name} → ${m.to_group.name}`
          : null,
      })
    }
    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  }, [data])

  const isMortgage = hasMortgageTemplate(data)
  const template = resolveWorkspaceTemplate(data as any)
  const isLoanLike = template?.key === 'loan' || template?.key === 'lead'
  const hasChecklistFields = data.fields.some((f: any) => isChecklistFieldType(f.field_type))
  const signals = useMemo(() => {
    if (!isMortgage) return []
    return computeOpportunitySignals(data as any, resolveWorkspaceTemplate(data as any).key)
  }, [data, isMortgage])

  return (
    <>
      {/* Stage tracker bar — continues the navy LOS header. */}
      <div className="flex flex-shrink-0 justify-start border-b border-jubo-navy2 bg-jubo-navy px-5 py-3 sm:justify-center">
        <StageTracker groups={data.groups} currentGroupId={data.record.group_id ?? null} />
      </div>

      {/* Phase 2A — warm LOS loan-file workspace (Overview). */}
      <div className="jubo-los-page h-full overflow-y-auto p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[20rem_minmax(0,1fr)_20rem] items-start">
          {/* LEFT — the loan file: Loan Snapshot, Property, Conditions. */}
          <div className="space-y-4">
            {isLoanLike ? <LoanSnapshot data={data as any} /> : <QualificationSnapshot data={data as any} />}
            <PropertyCard data={data as any} />
            {hasChecklistFields && (
              <section className="jubo-los-card p-3.5">
                <div className="mb-2.5 flex items-center gap-1.5">
                  <ListChecks className="h-3.5 w-3.5 text-jubo-gold" />
                  <p className="jubo-los-section-label">Conditions</p>
                </div>
                <ChecklistView
                  variant="los"
                  recordId={recordId}
                  boardId={data.record.board_id}
                  groupId={data.record.group_id ?? null}
                  fieldValues={data.fieldValues}
                  onChanged={onChanged}
                />
              </section>
            )}
          </div>
          {/* CENTER — unified timeline + composer (LOS). */}
          <div className="space-y-4">
            <UnifiedTimeline
              timeline={timeline}
              communications={data.communications}
              notes={data.notes}
              profiles={data.profiles}
              name={(data.record.title ?? '').trim().split(/\s+/)[0] || null}
              onCompose={(kind) =>
                nav(kind === 'note' ? 'notes' : kind === 'task' ? 'tasks' : 'communicate')
              }
              onFullHistory={() => nav('activity')}
            />
            {isMortgage ? <MortgageWorkspace data={data} onChanged={onChanged} /> : <OverviewView data={data} />}
          </div>
          {/* RIGHT — control rail (LOS): navy Next Step + cream sections. */}
          <div className="space-y-4 order-first lg:order-last lg:col-span-2 xl:order-none xl:col-span-1">
            <CommandRail
              recordId={recordId}
              data={data}
              signals={signals}
              onChanged={onChanged}
            />
          </div>
        </div>
      </div>
    </>
  )
}

// ── Command Rail ────────────────────────────────────────────────────────────
// The control panel: Next Step (dominant) with a compact signals subsection
// beneath it, then Tasks, Related (file team), and Move To.
function CommandRail({
  recordId, data, signals, onChanged,
}: {
  recordId: string
  data: Loaded
  signals: any[]
  onChanged: () => void
}) {
  const isMort = hasMortgageTemplate(data)
  const openTaskCount = data.tasks.filter((t: any) => !t.completed_at).length
  const topSignals = isMort ? signals.slice(0, 3) : []
  return (
    <div className="flex flex-col gap-4">
      <NextActionCard
        recordId={recordId}
        nextAction={data.record.next_action ?? null}
        nextActionDueAt={data.record.next_action_due_at ?? null}
        nextActionCompletedAt={data.record.next_action_completed_at ?? null}
      />
      {topSignals.length > 0 && (
        <div className="jubo-los-card space-y-1 px-3 py-2.5">
          {topSignals.map((s: any) => (
            <div key={s.key} className="flex items-center gap-1.5 text-2xs">
              <span
                className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: s.level === 'urgent' ? 'var(--jubo-red)' : s.level === 'warning' ? 'var(--jubo-gold)' : s.level === 'positive' ? 'var(--jubo-green)' : 'var(--jubo-muted)' }}
                aria-hidden
              />
              <span className="truncate text-jubo-text">{s.label}</span>
              {s.detail && <span className="ml-auto flex-shrink-0 text-jubo-muted">{s.detail}</span>}
            </div>
          ))}
        </div>
      )}

      <SidebarSection title={`Tasks${openTaskCount > 0 ? ` · ${openTaskCount}` : ''}`}>
        <UpcomingTasks tasks={data.tasks} />
      </SidebarSection>

      <ParticipantRibbon data={data as any} />

      <MoveToControl
        recordId={recordId}
        boardId={data.record.board_id}
        groups={data.groups}
        currentGroupId={data.record.group_id ?? null}
        onMoved={onChanged}
      />
    </div>
  )
}

// ── Move To ───────────────────────────────────────────────────────────────
function MoveToControl({
  recordId, boardId, groups, currentGroupId, onMoved,
}: {
  recordId: string
  boardId: string
  groups: any[]
  currentGroupId: string | null
  onMoved: () => void
}) {
  const [pending, startTransition] = useTransition()
  const sorted = useMemo(() => [...groups].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)), [groups])
  if (sorted.length < 2) return null

  const onSelect = (toGroupId: string) => {
    if (!toGroupId || toGroupId === currentGroupId) return
    startTransition(async () => {
      try { await moveRecord(recordId, toGroupId, boardId) } catch {}
      onMoved()
    })
  }

  return (
    <SidebarSection title="Move to stage">
      <select
        value={currentGroupId ?? ''}
        onChange={(e) => onSelect(e.target.value)}
        disabled={pending}
        className="w-full rounded-lg border border-jubo-border bg-jubo-card px-2.5 py-1.5 text-xs text-jubo-text transition-colors hover:border-jubo-border-strong focus:outline-none focus:ring-1 focus:ring-jubo-red disabled:opacity-60"
        aria-label="Move to stage"
      >
        {currentGroupId == null && <option value="">Select a stage…</option>}
        {sorted.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      {pending && <p className="mt-1 text-2xs text-jubo-muted">Moving…</p>}
    </SidebarSection>
  )
}

// ── Sub-views ────────────────────────────────────────────────────────────────

function OverviewView({ data }: { data: Loaded }) {
  const r = data.record
  const groupName = data.groups.find(g => g.id === r.group_id)?.name ?? '—'
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Priority" value={r.priority} capitalize />
        <Stat label="Group"    value={groupName} />
        <Stat label="Value"    value={r.value != null ? '$' + Number(r.value).toLocaleString() : '—'} />
      </div>

      {r.description && (
        <div className="jubo-los-card p-3">
          <p className="jubo-los-section-label mb-1">Description</p>
          <p className="text-sm text-jubo-text whitespace-pre-wrap">{r.description}</p>
        </div>
      )}

      <div className="jubo-los-card p-3">
        <p className="jubo-los-section-label mb-2">Fields</p>
        {data.fields.length === 0 ? (
          <p className="text-xs text-jubo-text-soft">No custom fields on this board.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.fields.map((f: any) => {
              const fv = data.fieldValues.find((v: any) => v.field_id === f.id)
              const value = fv?.value_text ?? fv?.value_number ?? fv?.value_date ?? fv?.value_bool
              return (
                <div key={f.id} className="space-y-0.5 text-xs">
                  <p className="text-jubo-muted">{f.name}</p>
                  <p className="text-jubo-text">{String(value ?? '—')}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-md bg-jubo-card-soft px-2.5 py-1.5">
      <p className="text-2xs uppercase tracking-wider text-jubo-muted">{label}</p>
      <p className={cn('text-sm font-medium text-jubo-text truncate', capitalize && 'capitalize')}>
        {value}
      </p>
    </div>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="jubo-los-card space-y-1.5 p-3.5">
      <p className="jubo-los-section-label">{title}</p>
      {children}
    </div>
  )
}

function UpcomingTasks({ tasks }: { tasks: any[] }) {
  const upcoming = tasks
    .filter(t => !t.completed_at)
    .sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0
      if (!a.due_date) return 1
      if (!b.due_date) return -1
      return a.due_date.localeCompare(b.due_date)
    })
    .slice(0, 4)

  if (upcoming.length === 0) {
    return <p className="text-2xs text-jubo-muted italic">No open tasks.</p>
  }

  const now = new Date()
  return (
    <div className="space-y-1">
      {upcoming.map(t => {
        const overdue = t.due_date && new Date(t.due_date) < now
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-jubo-card-soft transition-colors">
            <span className="flex-1 text-xs text-jubo-text truncate">{t.title}</span>
            {t.due_date && (
              <span className={cn('text-2xs tabular-nums', overdue ? 'text-jubo-red' : 'text-jubo-muted')}>
                {new Date(t.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
