'use client'

import { useState, useMemo, useRef, useCallback, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Settings, ChevronLeft, Search, X, SlidersHorizontal, Columns3, Bookmark } from 'lucide-react'
import Link from 'next/link'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/primitives/EmptyState'
import { CreateGroupModal } from '@/features/board-groups/components/CreateGroupModal'
import { CreateFieldModal } from '@/features/fields/components/CreateFieldModal'
import { CreateRecordModal } from '@/features/records/components/CreateRecordModal'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { BoardGroupTable } from './BoardGroupTable'
import { BoardSettingsModal } from './BoardSettingsModal'
import { DragOverlayRow } from './DragOverlayRow'
import { useBoardRealtime } from '@/hooks/useBoardRealtime'
import { moveRecord } from '@/features/records/actions'
import { createSavedView } from '../actions'
import { updateSavedViewAttention } from '@/features/daily-actions/attention/actions'
import { cn } from '@/lib/utils'
import type { RecordPriority, RecordStatus } from '@/types/database'

interface Props {
  board: any
  groups: any[]
  fields: any[]
  records: any[]
  fieldValues: any[]
  organizationId: string
}

const PRIORITY_OPTIONS: { value: RecordPriority | ''; label: string }[] = [
  { value: '', label: 'All priorities' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'none', label: 'None' },
]

const STATUS_OPTIONS: { value: RecordStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'on_hold', label: 'On Hold' },
]

export function BoardDetailClient({ board, groups, fields, records: serverRecords, fieldValues, organizationId }: Props) {
  const router = useRouter()
  const isMutating = useRef(false)

  // Local record state for optimistic updates
  const [localRecords, setLocalRecords] = useState(serverRecords)

  // Sync when server data refreshes
  useEffect(() => { setLocalRecords(serverRecords) }, [serverRecords])

  // Realtime
  useBoardRealtime(board.id, isMutating)

  // DnD
  const [activeRecord, setActiveRecord] = useState<any>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragStart = (event: DragStartEvent) => {
    setActiveRecord(event.active.data.current?.record ?? null)
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveRecord(null)
    if (!over) return

    const fromGroupId = active.data.current?.groupId
    const toGroupId = over.data.current?.groupId

    if (!toGroupId || fromGroupId === toGroupId) return

    const recordId = active.id as string

    // Optimistic update
    isMutating.current = true
    setLocalRecords(prev => prev.map(r => r.id === recordId ? { ...r, group_id: toGroupId } : r))

    try {
      await moveRecord(recordId, toGroupId, board.id)
      router.refresh()
    } catch {
      setLocalRecords(serverRecords) // rollback
    } finally {
      isMutating.current = false
    }
  }, [serverRecords, board.id, router])

  const handleOptimisticMove = useCallback((recordId: string, toGroupId: string) => {
    isMutating.current = true
    setLocalRecords(prev => prev.map(r => r.id === recordId ? { ...r, group_id: toGroupId } : r))
    setTimeout(() => { isMutating.current = false }, 2000)
  }, [])

  // UI state
  const [showCreateGroup, setShowCreateGroup] = useState(false)
  const [showCreateField, setShowCreateField] = useState(false)
  const [showCreateRecord, setShowCreateRecord] = useState<string | null>(null)
  const { openWorkspace } = useWorkspaceTabs()
  const [showSettings, setShowSettings] = useState(false)
  const [search, setSearch] = useState('')
  const [filterPriority, setFilterPriority] = useState<RecordPriority | ''>('')
  const [filterStatus, setFilterStatus] = useState<RecordStatus | ''>('')
  const [showFilters, setShowFilters] = useState(false)

  const hasActiveFilters = !!(search || filterPriority || filterStatus)
  const clearFilters = () => { setSearch(''); setFilterPriority(''); setFilterStatus('') }

  const [showSaveView, setShowSaveView] = useState(false)
  const [saveViewName, setSaveViewName] = useState('')
  const [showOnToday, setShowOnToday] = useState(false)
  const [attentionPriority, setAttentionPriority] = useState<'urgent' | 'high' | 'medium' | 'low'>('medium')
  const [saveViewError, setSaveViewError] = useState('')
  const [isSavingView, startSaveViewTransition] = useTransition()

  const handleSaveView = (e: React.FormEvent) => {
    e.preventDefault()
    if (!saveViewName.trim()) { setSaveViewError('Name is required'); return }
    setSaveViewError('')

    const filters: Array<{ field: string; operator: string; value: string }> = []
    if (filterPriority) filters.push({ field: 'priority', operator: 'eq', value: filterPriority })
    if (filterStatus) filters.push({ field: 'status', operator: 'eq', value: filterStatus })

    startSaveViewTransition(async () => {
      try {
        const viewId = await createSavedView({
          organization_id: organizationId,
          board_id: board.id,
          name: saveViewName.trim(),
          filters,
        })
        if (showOnToday) {
          await updateSavedViewAttention({
            saved_view_id: viewId,
            is_attention_view: true,
            show_on_today: true,
            attention_priority: attentionPriority,
            attention_label: saveViewName.trim(),
          })
        }
        setShowSaveView(false)
        setSaveViewName('')
        setShowOnToday(false)
        setAttentionPriority('medium')
      } catch (err) {
        setSaveViewError(err instanceof Error ? err.message : 'Failed to save view')
      }
    })
  }

  // Build field values index
  const fieldValuesIndex = useMemo(() => {
    const index: Record<string, Record<string, any>> = {}
    for (const fv of fieldValues) {
      if (!index[fv.record_id]) index[fv.record_id] = {}
      index[fv.record_id][fv.field_id] = fv
    }
    return index
  }, [fieldValues])

  // Filtered records
  const filteredRecords = useMemo(() => {
    let result = localRecords
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((r: any) => r.title.toLowerCase().includes(q))
    }
    if (filterPriority) result = result.filter((r: any) => r.priority === filterPriority)
    if (filterStatus) result = result.filter((r: any) => r.status === filterStatus)
    return result
  }, [localRecords, search, filterPriority, filterStatus])

  const filteredByGroup = useMemo(() =>
    groups.reduce<Record<string, any[]>>((acc, g) => {
      acc[g.id] = filteredRecords.filter((r: any) => r.group_id === g.id)
      return acc
    }, {}),
  [filteredRecords, groups])

  const totalByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = localRecords.filter((r: any) => r.group_id === g.id).length
      return acc
    }, {}),
  [localRecords, groups])

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="flex flex-col h-full min-h-0">
        {/* Board header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-shrink-0">
          <Link href="/boards" className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {board.color && <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: board.color }} />}
              <h2 className="text-sm font-semibold text-foreground">{board.name}</h2>
              <span className="text-2xs px-1.5 py-0.5 rounded-full bg-surface-2 text-muted-foreground capitalize border border-border">{board.board_type}</span>
            </div>
            {board.description && <p className="text-xs text-muted-foreground mt-0.5">{board.description}</p>}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" onClick={() => setShowCreateGroup(true)}>
              <Plus className="w-3 h-3" />Group
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7" title="Settings" onClick={() => setShowSettings(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Search + filter bar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-border flex-shrink-0 flex-wrap">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search records…"
              className="pl-8 pr-8 py-1.5 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-48"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Button
            size="sm" variant="ghost"
            className={cn('h-7 text-xs gap-1.5', (filterPriority || filterStatus) && 'text-primary')}
            onClick={() => setShowFilters(f => !f)}
          >
            <SlidersHorizontal className="w-3 h-3" />
            Filters
            {(filterPriority || filterStatus) && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
          </Button>
          {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Clear</button>}
          {(filterPriority || filterStatus) && !showSaveView && (
            <button
              onClick={() => { setShowSaveView(true); setSaveViewName('') }}
              className="flex items-center gap-1 h-7 px-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-surface-1 transition-colors"
            >
              <Bookmark className="w-3 h-3" />
              Save view
            </button>
          )}
          {showSaveView && (
            <form onSubmit={handleSaveView} className="flex items-center gap-1.5 flex-wrap">
              <input
                type="text"
                value={saveViewName}
                onChange={e => setSaveViewName(e.target.value)}
                placeholder="View name…"
                autoFocus
                className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary w-32"
              />
              <label className="inline-flex items-center gap-1 text-2xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showOnToday}
                  onChange={e => setShowOnToday(e.target.checked)}
                  className="rounded border-border"
                />
                Show on Today
              </label>
              {showOnToday && (
                <select
                  value={attentionPriority}
                  onChange={e => setAttentionPriority(e.target.value as 'urgent' | 'high' | 'medium' | 'low')}
                  className="h-7 px-1.5 text-2xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-primary capitalize"
                >
                  <option value="urgent">Urgent</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              )}
              {saveViewError && <span className="text-2xs text-red-400">{saveViewError}</span>}
              <button type="submit" disabled={isSavingView}
                className="h-7 px-2 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {isSavingView ? '…' : 'Save'}
              </button>
              <button type="button" onClick={() => setShowSaveView(false)}
                className="h-7 px-1 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </form>
          )}
          {showFilters && (
            <>
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as RecordPriority | '')} className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-primary">
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as RecordStatus | '')} className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-primary">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          )}
        </div>

        {/* Board content */}
        <div className="flex-1 overflow-y-auto overflow-x-auto px-4 py-4">
          {groups.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <EmptyState icon={Columns3} title="No groups yet" description="Add your first group to start organizing records in this board.">
                <Button size="sm" onClick={() => setShowCreateGroup(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" />Add first group
                </Button>
              </EmptyState>
            </div>
          ) : (
            <div className="min-w-max">
              {groups.map(group => (
                <BoardGroupTable
                  key={group.id}
                  group={group}
                  records={filteredByGroup[group.id] ?? []}
                  fields={fields}
                  fieldValuesIndex={fieldValuesIndex}
                  groups={groups}
                  boardId={board.id}
                  hasActiveFilters={hasActiveFilters}
                  totalCount={totalByGroup[group.id] ?? 0}
                  onAddRecord={() => setShowCreateRecord(group.id)}
                  onAddField={() => setShowCreateField(true)}
                  onSelectRecord={id => {
                    const r = localRecords.find((x: any) => x.id === id)
                    openWorkspace({ recordId: id, title: r?.title ?? 'Record' })
                  }}
                  onOptimisticMove={handleOptimisticMove}
                />
              ))}
            </div>
          )}
        </div>

        {/* Modals */}
        <CreateGroupModal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} boardId={board.id} nextPosition={groups.length} />
        <CreateFieldModal open={showCreateField} onClose={() => setShowCreateField(false)} boardId={board.id} organizationId={organizationId} nextPosition={fields.length} />
        {showCreateRecord && (
          <CreateRecordModal open onClose={() => setShowCreateRecord(null)} boardId={board.id} groupId={showCreateRecord} organizationId={organizationId} fields={fields} />
        )}
        <BoardSettingsModal open={showSettings} onClose={() => setShowSettings(false)} board={board} />
      </div>

      <DragOverlay>
        {activeRecord && <DragOverlayRow record={activeRecord} />}
      </DragOverlay>
    </DndContext>
  )
}
