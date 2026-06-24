'use client'

import { useEffect, useState, useCallback, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  X, Maximize2, FileText, Activity, ListChecks, StickyNote, Database, Columns3,
  ArrowRightLeft, CheckSquare, IdCard, MessageSquare, Phone, Mail, CalendarDays,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoveToBoardDialog } from '@/features/boards/components/MoveToBoardDialog'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTabs } from '../providers/WorkspaceTabsProvider'
import { ActivityTimeline } from '../timeline/ActivityTimeline'
import { ChecklistView } from '../checklist/ChecklistView'
import { PersonCard } from '@/features/person-card/PersonCard'
import { CommunicateView } from '@/features/communications/components/CommunicateView'
import { NoteList } from '../notes/NoteList'
import { NextActionCard } from './NextActionCard'
import { WorkspaceTasks } from './WorkspaceTasks'
import { useWorkspaceKeyboard } from '../hooks/useWorkspaceKeyboard'
import { MortgageWorkspace, hasMortgageTemplate } from '@/features/mortgage/workspaces/MortgageWorkspace'
import { computeOpportunitySignals } from '@/features/mortgage/scoring/opportunities'
import { resolveWorkspaceTemplate } from '@/features/mortgage/templates/resolve'
import { isChecklistFieldType } from '@/features/fields/checklist'
import { StageTracker } from '../command/StageTracker'
import { ParticipantRibbon } from '../command/ParticipantRibbon'
import { UnifiedTimeline } from '../command/UnifiedTimeline'
import { QualificationSnapshot } from '../command/QualificationSnapshot'
import { LoanSnapshot } from '../command/LoanSnapshot'
import { PropertyCard } from '../command/PropertyCard'
import { moveRecord } from '@/features/records/actions'
import { getContactHealth } from '@/features/communications/metrics'
import type { ContactHealth } from '@/features/communications/types'
import type { WorkspaceTabKey, NoteRow, TimelineItem } from '../types'
import { WORKSPACE_TABS, WORKSPACE_TAB_LABELS } from '../types'

const TAB_ICONS: Record<WorkspaceTabKey, React.ElementType> = {
  overview:    FileText,
  card:        IdCard,
  communicate: MessageSquare,
  checklist:   CheckSquare,
  activity:    Activity,
  tasks:       ListChecks,
  notes:       StickyNote,
  data:        Database,
  pipeline:    Columns3,
}

type Loaded = {
  record: any
  board: any
  communications: any[]
  fields: any[]
  fieldValues: any[]
  activities: any[]
  tasks: any[]
  movements: any[]
  notes: NoteRow[]
  groups: any[]
  profiles: Record<string, string>
  currentUserId: string | null
}

export function WorkspacePanel() {
  const { tabs, activeRecordId, closeWorkspace, setActiveSubTab, cycleSubTab, closeAll } = useWorkspaceTabs()
  const activeTab = tabs.find(t => t.recordId === activeRecordId) ?? null

  // Keyboard: Esc closes, Cmd+Shift+[ / ] cycles sub-tabs
  useWorkspaceKeyboard({
    enabled: !!activeRecordId,
    onClose: closeAll,
    onCycle: cycleSubTab,
  })

  if (!activeTab) return null

  return (
    <WorkspaceContent
      key={activeTab.recordId}
      recordId={activeTab.recordId}
      activeSubTab={activeTab.activeSubTab}
      onSubTabChange={(t) => setActiveSubTab(activeTab.recordId, t)}
      onClose={() => closeWorkspace(activeTab.recordId)}
    />
  )
}

function WorkspaceContent({
  recordId, activeSubTab, onSubTabChange, onClose,
}: {
  recordId: string
  activeSubTab: WorkspaceTabKey
  onSubTabChange: (t: WorkspaceTabKey) => void
  onClose: () => void
}) {
  const router = useRouter()
  const { openWorkspace } = useWorkspaceTabs()
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [showMove, setShowMove] = useState(false)

  const load = useCallback(async () => {
    const supabase = createClient()
    setLoading(true)
    try {
      const [rRes, userRes] = await Promise.all([
        supabase.from('records').select('*').eq('id', recordId).single(),
        supabase.auth.getUser(),
      ])
      const record = rRes.data
      const currentUserId = userRes.data.user?.id ?? null
      if (!record) { setData(null); setLoading(false); return }

      const [fieldsRes, fvRes, aRes, tRes, mRes, gRes, nRes, bRes, cRes] = await Promise.all([
        supabase.from('fields').select('*').eq('board_id', record.board_id).order('position'),
        supabase.from('field_values').select('*').eq('record_id', recordId),
        supabase.from('activities').select('*').eq('record_id', recordId).order('created_at', { ascending: false }).limit(40),
        supabase.from('tasks').select('*').eq('record_id', recordId).order('created_at', { ascending: false }),
        supabase.from('record_movements').select('*, from_group:from_group_id(name), to_group:to_group_id(name)').eq('record_id', recordId).order('created_at', { ascending: false }).limit(20),
        supabase.from('board_groups').select('*').eq('board_id', record.board_id).eq('is_archived', false).order('position'),
        supabase.from('notes').select('*').eq('record_id', recordId).order('created_at', { ascending: false }),
        supabase.from('boards').select('id, name, slug, board_type').eq('id', record.board_id).single(),
        supabase.from('communication_logs').select('*').eq('record_id', recordId).order('occurred_at', { ascending: false }),
      ])

      // Resolve actor names from activities + tasks + notes + movements
      const userIds = new Set<string>()
      for (const a of aRes.data ?? []) if (a.user_id) userIds.add(a.user_id)
      for (const t of tRes.data ?? []) { if (t.created_by) userIds.add(t.created_by); if (t.assigned_user_id) userIds.add(t.assigned_user_id) }
      for (const n of nRes.data ?? []) if (n.author_user_id) userIds.add(n.author_user_id)
      for (const m of mRes.data ?? []) if (m.user_id) userIds.add(m.user_id)
      const profiles: Record<string, string> = {}
      if (userIds.size > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, first_name, last_name')
          .in('id', [...userIds])
        for (const p of profs ?? []) {
          profiles[p.id] = [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown'
        }
      }

      // Refresh the tab title once we know the record name
      openWorkspace({ recordId, title: record.title })

      setData({
        record,
        board: bRes.data ?? null,
        communications: cRes.data ?? [],
        fields: fieldsRes.data ?? [],
        fieldValues: fvRes.data ?? [],
        activities: aRes.data ?? [],
        tasks: tRes.data ?? [],
        movements: mRes.data ?? [],
        notes: nRes.data ?? [],
        groups: gRes.data ?? [],
        profiles,
        currentUserId,
      })
    } finally {
      setLoading(false)
    }
  }, [recordId, openWorkspace])

  useEffect(() => { load() }, [load])

  // Refetch when the page revalidates
  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [load])

  const timeline = useMemo<TimelineItem[]>(() => {
    if (!data) return []
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

  const isMortgage = data ? hasMortgageTemplate(data) : false
  const contactHealth: ContactHealth = data ? getContactHealth(data.communications) : 'unknown'

  // Phase 3 — Needs Attention signals (mortgage templates only; generic parity
  // is a later phase). Pure: reads loaded data, no query.
  const signals = useMemo(() => {
    if (!data || !isMortgage) return []
    return computeOpportunitySignals(data as any, resolveWorkspaceTemplate(data as any).key)
  }, [data, isMortgage])

  // Phase 10.1 — header identity bits (role label + phone) from loaded data only.
  const template = data ? resolveWorkspaceTemplate(data as any) : null
  const roleLabel = template?.label ?? ''
  // Loan-like records get the Loan Snapshot in the left column; non-loan entities
  // get their Qualification (Refi/Production) snapshot instead.
  const isLoanLike = template?.key === 'loan' || template?.key === 'lead'
  const hasChecklistFields = !!data && data.fields.some((f: any) => isChecklistFieldType(f.field_type))
  const phone = useMemo(() => {
    if (!data) return null
    const f = data.fields.find((x: any) => x.slug === 'phone')
    if (!f) return null
    return data.fieldValues.find((v: any) => v.field_id === f.id)?.value_text ?? null
  }, [data])

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-[min(72rem,92vw)] bg-background border-l border-border flex flex-col h-full shadow-2xl">
        {/* Header — borrower identity (left) + quick actions (right). Phase 10.1
            command-center bar; the stage tracker lives in its own bar below. */}
        <header className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-border bg-gradient-to-b from-surface-2 to-surface-1 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {loading ? (
              <div className="h-10 w-10 rounded-lg bg-surface-2 animate-pulse flex-shrink-0" />
            ) : (
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-sm">
                {initials(data?.record?.title)}
              </div>
            )}
            <div className="min-w-0">
              {loading ? (
                <div className="h-6 w-56 bg-surface-2 rounded animate-pulse" />
              ) : (
                <h2 className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
                  {data && (
                    <span
                      className="h-2 w-2 flex-shrink-0 rounded-full"
                      style={{ backgroundColor: contactHealth === 'healthy' ? 'var(--accent-green)' : contactHealth === 'warming' ? 'var(--accent-amber)' : contactHealth === 'stale' ? 'var(--accent-rose)' : 'var(--surface-3)' }}
                      title={`Contact health: ${contactHealth}`}
                      aria-hidden
                    />
                  )}
                  <span className="truncate">{data?.record?.title ?? 'Record'}</span>
                </h2>
              )}
              {data && (
                <p className="mt-0.5 truncate text-2xs text-muted-foreground">
                  {roleLabel}{phone ? <> · <span className="tabular-nums text-foreground/80">{phone}</span></> : null}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5 flex-shrink-0">
            {/* Quick actions — defined cluster; call is the accented primary
                action (reuses existing surfaces, no new comm logic). */}
            {phone && (
              <a
                href={`tel:${phone}`}
                title="Call"
                className="rounded-lg bg-primary p-2 text-primary-foreground shadow-sm transition-[filter] hover:brightness-110"
              >
                <Phone className="h-4 w-4" />
              </a>
            )}
            <button onClick={() => onSubTabChange('communicate')} title="Message"
              className="rounded-lg bg-surface-2/70 p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
              <MessageSquare className="h-4 w-4" />
            </button>
            <button onClick={() => onSubTabChange('communicate')} title="Email"
              className="rounded-lg bg-surface-2/70 p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
              <Mail className="h-4 w-4" />
            </button>
            <button onClick={() => onSubTabChange('tasks')} title="Tasks & follow-up"
              className="rounded-lg bg-surface-2/70 p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
              <CalendarDays className="h-4 w-4" />
            </button>

            <span className="mx-1.5 h-5 w-px bg-border" aria-hidden />

            {/* Overflow — existing move / open-in-board / close. */}
            {data?.record?.board_id && (
              <button onClick={() => setShowMove(true)} title="Move to another board"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
                <ArrowRightLeft className="h-4 w-4" />
              </button>
            )}
            {data?.record?.board_id && (
              <Link href={`/boards/${data.record.board_id}`} title="Open in board"
                className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
                <Maximize2 className="h-4 w-4" />
              </Link>
            )}
            <button onClick={onClose} title="Close (esc)"
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Stage tracker bar — the loan lifecycle, prominent + always near top. */}
        {data && (
          <div className="flex flex-shrink-0 justify-start border-b border-border bg-surface-0/50 px-5 py-3 sm:justify-center">
            <StageTracker groups={data.groups} currentGroupId={data.record.group_id ?? null} />
          </div>
        )}

        {showMove && data?.record?.board_id && (
          <MoveToBoardDialog
            recordIds={[recordId]}
            currentBoardId={data.record.board_id}
            onClose={() => setShowMove(false)}
            onMoved={() => { setShowMove(false); load(); router.refresh() }}
          />
        )}

        {/* Tabs nav — horizontally scrollable on small screens */}
        <div className="flex items-center gap-0.5 px-3 border-b border-border flex-shrink-0 overflow-x-auto">
          {WORKSPACE_TABS.filter(t => t !== 'pipeline' && t !== 'data').map(t => {
            const Icon = TAB_ICONS[t]
            const active = activeSubTab === t
            return (
              <button
                key={t}
                onClick={() => onSubTabChange(t)}
                className={cn(
                  'flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
                  active
                    ? 'border-primary text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="w-3 h-3" />
                {WORKSPACE_TAB_LABELS[t]}
                {t === 'tasks' && data && data.tasks.filter((x: any) => !x.completed_at).length > 0 && (
                  <span className="text-2xs px-1.5 py-0 rounded-full bg-surface-2 text-foreground tabular-nums">
                    {data.tasks.filter((x: any) => !x.completed_at).length}
                  </span>
                )}
                {t === 'notes' && data && data.notes.length > 0 && (
                  <span className="text-2xs px-1.5 py-0 rounded-full bg-surface-2 text-foreground tabular-nums">
                    {data.notes.length}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Body: content + right sidebar */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {loading || !data ? (
            <div className="space-y-3 p-5">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-8 bg-surface-1 rounded animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
              ))}
            </div>
          ) : activeSubTab === 'overview' ? (
            // Phase 10.1 — three-column Borrower Command Center (Overview).
            <div className="h-full overflow-y-auto p-5">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-[20rem_minmax(0,1fr)_20rem] items-start">
                {/* LEFT — the loan file: Loan Snapshot, Property, Conditions. */}
                <div className="space-y-4">
                  {isLoanLike ? <LoanSnapshot data={data as any} /> : <QualificationSnapshot data={data as any} />}
                  <PropertyCard data={data as any} />
                  {hasChecklistFields && (
                    <section className="rounded-xl border border-border/60 bg-surface-1/30 p-3.5">
                      <div className="mb-2.5 flex items-center gap-1.5">
                        <ListChecks className="h-3.5 w-3.5 text-muted-foreground" />
                        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Conditions</p>
                      </div>
                      <ChecklistView
                        recordId={recordId}
                        boardId={data.record.board_id}
                        groupId={data.record.group_id ?? null}
                        fieldValues={data.fieldValues}
                        onChanged={load}
                      />
                    </section>
                  )}
                </div>
                {/* CENTER — the borrower story: unified timeline + composer (10.3),
                    then the deeper file detail below. */}
                <div className="space-y-4">
                  <UnifiedTimeline
                    timeline={timeline}
                    communications={data.communications}
                    notes={data.notes}
                    profiles={data.profiles}
                    name={(data.record.title ?? '').trim().split(/\s+/)[0] || null}
                    onCompose={(kind) =>
                      onSubTabChange(kind === 'note' ? 'notes' : kind === 'task' ? 'tasks' : 'communicate')
                    }
                    onFullHistory={() => onSubTabChange('activity')}
                  />
                  {hasMortgageTemplate(data) ? <MortgageWorkspace data={data} onChanged={load} /> : <OverviewView data={data} />}
                </div>
                {/* RIGHT — control rail (NextAction prioritized on mobile via order) */}
                <div className="space-y-4 order-first lg:order-last lg:col-span-2 xl:order-none xl:col-span-1">
                  <CommandRail
                    recordId={recordId}
                    data={data}
                    signals={signals}
                    onChanged={load}
                  />
                </div>
              </div>
            </div>
          ) : (
            // Non-overview tabs keep main content + the command rail (desktop).
            <div className="grid h-full grid-cols-1 lg:grid-cols-[1fr_18rem] overflow-hidden">
              <div className="overflow-y-auto p-5">
                {activeSubTab === 'card' && (
                  <PersonCard recordId={recordId} />
                )}
                {activeSubTab === 'communicate' && (
                  <CommunicateView recordId={recordId} organizationId={data.record.organization_id} />
                )}
                {activeSubTab === 'checklist' && (
                  <ChecklistView
                    recordId={recordId}
                    boardId={data.record.board_id}
                    groupId={data.record.group_id ?? null}
                    fieldValues={data.fieldValues}
                    onChanged={load}
                  />
                )}
                {activeSubTab === 'activity' && (
                  <ActivityTimeline items={timeline} emptyHint="No activity on this record yet." />
                )}
                {activeSubTab === 'tasks' && (
                  <WorkspaceTasks
                    recordId={recordId}
                    organizationId={data.record.organization_id}
                    boardId={data.record.board_id}
                    tasks={data.tasks}
                  />
                )}
                {activeSubTab === 'notes' && (
                  <div className="space-y-3">
                    <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Notes</p>
                    <NoteList
                      organizationId={data.record.organization_id}
                      recordId={recordId}
                      notes={data.notes}
                      currentUserId={data.currentUserId}
                      defaultDrafting
                    />
                  </div>
                )}
                {activeSubTab === 'data' && (
                  <DataView data={data} />
                )}
              </div>

              <aside className="hidden lg:flex flex-col overflow-y-auto border-l border-border bg-surface-1/30 p-4 gap-4">
                <CommandRail
                  recordId={recordId}
                  data={data}
                  signals={signals}
                  onChanged={load}
                />
              </aside>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Up to two initials from a record title for the header avatar. */
function initials(title?: string | null): string {
  const parts = (title ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// ── Command Rail ────────────────────────────────────────────────────────────
// The control panel: Next Step (dominant) with a compact signals subsection
// beneath it, then Tasks, Related (file team), and Move To. Rendered in the
// desktop rail AND inline on mobile. Pure composition over loaded data.
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
      {/* Next Step — the dominant element, with a compact signals subsection
          directly beneath so attention supports (not competes with) it. */}
      <div className="premium-surface overflow-hidden rounded-xl">
        <NextActionCard
          recordId={recordId}
          nextAction={data.record.next_action ?? null}
          nextActionDueAt={data.record.next_action_due_at ?? null}
          nextActionCompletedAt={data.record.next_action_completed_at ?? null}
        />
        {topSignals.length > 0 && (
          <div className="space-y-1 border-t border-border/60 px-3 py-2">
            {topSignals.map((s: any) => (
              <div key={s.key} className="flex items-center gap-1.5 text-2xs">
                <span
                  className="h-1.5 w-1.5 flex-shrink-0 rounded-full"
                  style={{ backgroundColor: s.level === 'urgent' ? 'var(--accent-rose)' : s.level === 'warning' ? 'var(--accent-amber)' : s.level === 'positive' ? 'var(--accent-green)' : 'var(--muted-foreground)' }}
                  aria-hidden
                />
                <span className="truncate text-foreground">{s.label}</span>
                {s.detail && <span className="ml-auto flex-shrink-0 text-muted-foreground">{s.detail}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tasks — open task preview (full management in the Tasks tab). */}
      <SidebarSection title={`Tasks${openTaskCount > 0 ? ` · ${openTaskCount}` : ''}`}>
        <UpcomingTasks tasks={data.tasks} />
      </SidebarSection>

      {/* Related / File team — collapses when no participant data exists. */}
      <ParticipantRibbon data={data as any} />

      {/* Move To — stage selector reusing existing move logic (RPC + workflows). */}
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

// ── Move To (Phase 10.4) ───────────────────────────────────────────────────
// A stage selector over the board's existing groups; selecting a stage calls the
// existing moveRecord (move_record RPC + workflow dispatch). Participants moved
// to the top "File team" ribbon in Phase 10.6.
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
        className="w-full rounded-lg border border-border bg-surface-1 px-2.5 py-1.5 text-xs text-foreground transition-colors hover:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
        aria-label="Move to stage"
      >
        {currentGroupId == null && <option value="">Select a stage…</option>}
        {sorted.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
      {pending && <p className="mt-1 text-2xs text-muted-foreground">Moving…</p>}
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
        {/* Internal records.status removed (Phase 34A.1) — surfaced only via the
            user-facing Status field on the board. Priority/Group/Value remain. */}
        <Stat label="Priority" value={r.priority} capitalize />
        <Stat label="Group"    value={groupName} />
        <Stat label="Value"    value={r.value != null ? '$' + Number(r.value).toLocaleString() : '—'} />
      </div>

      {r.description && (
        <div className="rounded-lg border border-border bg-card p-3">
          <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-1">Description</p>
          <p className="text-sm text-foreground whitespace-pre-wrap">{r.description}</p>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card p-3">
        <p className="text-2xs uppercase tracking-wider text-muted-foreground mb-2">Fields</p>
        {data.fields.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom fields on this board.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {data.fields.map((f: any) => {
              const fv = data.fieldValues.find((v: any) => v.field_id === f.id)
              const value = fv?.value_text ?? fv?.value_number ?? fv?.value_date ?? fv?.value_bool
              return (
                <div key={f.id} className="space-y-0.5 text-xs">
                  <p className="text-muted-foreground">{f.name}</p>
                  <p className="text-foreground">{String(value ?? '—')}</p>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function DataView({ data }: { data: Loaded }) {
  return (
    <div className="space-y-3">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">Raw fields</p>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {data.fields.length === 0 ? (
          <p className="text-xs text-muted-foreground p-3">No fields configured.</p>
        ) : (
          data.fields.map((f: any) => {
            const fv = data.fieldValues.find((v: any) => v.field_id === f.id)
            const display = fv?.value_text ?? fv?.value_number ?? fv?.value_date ?? fv?.value_bool ?? '—'
            return (
              <div key={f.id} className="grid grid-cols-3 gap-3 px-3 py-2 text-xs">
                <span className="text-muted-foreground truncate" title={f.name}>{f.name}</span>
                <span className="text-2xs text-muted-foreground uppercase tracking-wider self-center">{f.field_type}</span>
                <span className="text-foreground truncate">{String(display)}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, capitalize }: { label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="rounded-md bg-surface-1 px-2.5 py-1.5">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={cn('text-sm font-medium text-foreground truncate', capitalize && 'capitalize')}>
        {value}
      </p>
    </div>
  )
}

function SidebarSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-2xs uppercase tracking-wider text-muted-foreground">{title}</p>
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
    return <p className="text-2xs text-muted-foreground italic">No open tasks.</p>
  }

  const now = new Date()
  return (
    <div className="space-y-1">
      {upcoming.map(t => {
        const overdue = t.due_date && new Date(t.due_date) < now
        return (
          <div key={t.id} className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-2 transition-colors">
            <span className="flex-1 text-xs text-foreground truncate">{t.title}</span>
            {t.due_date && (
              <span className={cn('text-2xs tabular-nums', overdue ? 'text-red-400' : 'text-muted-foreground')}>
                {new Date(t.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

