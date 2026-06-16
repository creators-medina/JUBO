'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  X, Maximize2, FileText, Activity, ListChecks, StickyNote, Database, Columns3,
  ExternalLink, MoreHorizontal, ArrowRightLeft, CheckSquare, IdCard,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { MoveToBoardDialog } from '@/features/boards/components/MoveToBoardDialog'
import { createClient } from '@/lib/supabase/client'
import { useWorkspaceTabs } from '../providers/WorkspaceTabsProvider'
import { ActivityTimeline } from '../timeline/ActivityTimeline'
import { ChecklistView } from '../checklist/ChecklistView'
import { PersonCard } from '@/features/person-card/PersonCard'
import { NoteList } from '../notes/NoteList'
import { NextActionCard } from './NextActionCard'
import { WorkspaceTasks } from './WorkspaceTasks'
import { useWorkspaceKeyboard } from '../hooks/useWorkspaceKeyboard'
import { MortgageWorkspace, hasMortgageTemplate } from '@/features/mortgage/workspaces/MortgageWorkspace'
import { WorkspaceHeaderMeta } from '@/features/mortgage/workspaces/WorkspaceHeaderMeta'
import { CommunicationActions } from '@/features/communications/components/CommunicationActions'
import { LastContactCard } from '@/features/communications/components/LastContactCard'
import type { WorkspaceTabKey, NoteRow, TimelineItem } from '../types'
import { WORKSPACE_TABS, WORKSPACE_TAB_LABELS } from '../types'

const TAB_ICONS: Record<WorkspaceTabKey, React.ElementType> = {
  overview:  FileText,
  card:      IdCard,
  checklist: CheckSquare,
  activity:  Activity,
  tasks:     ListChecks,
  notes:     StickyNote,
  data:      Database,
  pipeline:  Columns3,
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
      tabs={tabs.length}
    />
  )
}

function WorkspaceContent({
  recordId, activeSubTab, onSubTabChange, onClose, tabs,
}: {
  recordId: string
  activeSubTab: WorkspaceTabKey
  onSubTabChange: (t: WorkspaceTabKey) => void
  onClose: () => void
  tabs: number
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

  const groupName = data?.groups.find(g => g.id === data?.record?.group_id)?.name ?? '—'

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-[min(72rem,92vw)] bg-background border-l border-border flex flex-col h-full shadow-2xl">
        {/* Top bar — title + actions */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex flex-col min-w-0">
              {loading ? (
                <div className="h-5 w-64 bg-surface-2 rounded animate-pulse" />
              ) : (
                <h2 className="text-base font-semibold text-foreground truncate">{data?.record?.title ?? 'Record'}</h2>
              )}
              <p className="text-2xs text-muted-foreground">
                {data?.record?.board_id && (
                  <Link href={`/boards/${data.record.board_id}`}
                    className="hover:text-foreground transition-colors inline-flex items-center gap-1">
                    Board
                    <ExternalLink className="w-2.5 h-2.5" />
                  </Link>
                )}
                {data && (<>
                  {' · '}
                  <span>{groupName}</span>
                  {/* Internal records.status hidden (Phase 34A.1) — it's a
                      system field (archive/filtering), not user-facing status. */}
                </>)}
              </p>
              {data && <WorkspaceHeaderMeta data={data} />}
            </div>
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {tabs > 1 && (
              <span className="text-2xs text-muted-foreground mr-2">⌘⇧] next · ⌘⇧[ prev</span>
            )}
            {data?.record?.board_id && (
              <button
                onClick={() => setShowMove(true)}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                title="Move to another board"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
              </button>
            )}
            {data?.record?.board_id && (
              <Link
                href={`/boards/${data.record.board_id}`}
                className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
                title="Open in board"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Link>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
              title="Close (esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {showMove && data?.record?.board_id && (
          <MoveToBoardDialog
            recordIds={[recordId]}
            currentBoardId={data.record.board_id}
            onClose={() => setShowMove(false)}
            onMoved={() => { setShowMove(false); load(); router.refresh() }}
          />
        )}

        {/* Tabs nav */}
        <div className="flex items-center gap-0.5 px-3 border-b border-border flex-shrink-0">
          {WORKSPACE_TABS.filter(t => t !== 'pipeline').map(t => {
            const Icon = TAB_ICONS[t]
            const active = activeSubTab === t
            return (
              <button
                key={t}
                onClick={() => onSubTabChange(t)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors',
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
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_18rem] overflow-hidden">
          <div className="overflow-y-auto p-5">
            {loading || !data ? (
              <div className="space-y-3">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="h-8 bg-surface-1 rounded animate-pulse" style={{ opacity: 1 - i * 0.15 }} />
                ))}
              </div>
            ) : (
              <>
                {activeSubTab === 'overview' && (
                  hasMortgageTemplate(data)
                    ? <MortgageWorkspace data={data} onChanged={load} />
                    : <OverviewView data={data} />
                )}
                {activeSubTab === 'card' && (
                  <PersonCard recordId={recordId} />
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
                  <NoteList
                    organizationId={data.record.organization_id}
                    recordId={recordId}
                    notes={data.notes}
                    currentUserId={data.currentUserId}
                  />
                )}
                {activeSubTab === 'data' && (
                  <DataView data={data} />
                )}
              </>
            )}
          </div>

          {/* Right sidebar */}
          <aside className="hidden lg:flex flex-col overflow-y-auto border-l border-border bg-surface-1/30 p-4 gap-4">
            {data && (
              <>
                <CommunicationActions recordId={recordId} onChanged={load} />
                <LastContactCard logs={data.communications} />

                <NextActionCard
                  recordId={recordId}
                  nextAction={data.record.next_action ?? null}
                  nextActionDueAt={data.record.next_action_due_at ?? null}
                  nextActionCompletedAt={data.record.next_action_completed_at ?? null}
                />

                <SidebarSection title="Upcoming Tasks">
                  <UpcomingTasks tasks={data.tasks} />
                </SidebarSection>

                <SidebarSection title="Recent Activity">
                  <CompactTimeline items={timeline.slice(0, 5)} />
                </SidebarSection>

                <SidebarSection title="Related Records">
                  <p className="text-2xs text-muted-foreground italic">Coming soon</p>
                </SidebarSection>
              </>
            )}
          </aside>
        </div>
      </div>
    </div>
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

function CompactTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return <p className="text-2xs text-muted-foreground italic">No recent activity.</p>
  }
  return (
    <div className="space-y-1">
      {items.map(item => (
        <div key={`${item.type}-${item.id}`} className="text-2xs text-muted-foreground">
          <span className="text-foreground">{item.actor_name ?? 'System'}</span>{' '}
          <span>{item.activity_type.replace('_', ' ')}</span>
        </div>
      ))}
    </div>
  )
}
