'use client'

import { useState, useMemo, useRef, useCallback, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Settings, ChevronLeft, Search, X, SlidersHorizontal, Columns3, Bookmark, Zap, MoreVertical, Copy, Archive, Pencil, Loader2, Rows3, LayoutGrid, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, defaultDropAnimationSideEffects, useDndContext } from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent, DropAnimation } from '@dnd-kit/core'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/primitives/EmptyState'
import { CreateGroupModal } from '@/features/board-groups/components/CreateGroupModal'
import { CreateFieldModal } from '@/features/fields/components/CreateFieldModal'
import { CreateRecordModal } from '@/features/records/components/CreateRecordModal'
import { useWorkspaceTabs } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { BoardGroupTable } from './BoardGroupTable'
import { BoardKanbanView, type Stage } from './BoardKanbanView'
import { KanbanCardFace, formatCellValue } from './KanbanCardFace'
import { BoardStageSummary } from './BoardStageSummary'
import { BoardSettingsModal } from './BoardSettingsModal'
import { AutomationsModal } from '@/features/workflows/components/AutomationsModal'
import { BulkActionBar } from './BulkActionBar'
import { DragOverlayRow } from './DragOverlayRow'
import { useBoardRealtime } from '@/hooks/useBoardRealtime'
import { moveRecord } from '@/features/records/actions'
import { buildVisibilityIndex, resolveVisibleFields, commonFieldIds, isFieldVisibleInGroup, type FieldVisibilityRow } from '@/features/fields/visibility'
import { computeGroupChecklist } from '@/features/fields/checklist'
import { reorderFields } from '@/features/fields/actions'
import { createSavedView, reorderBoardGroups, duplicateBoardStructure, archiveBoard } from '../actions'
import { addNotesColumn } from '@/features/fields/actions'
import { isNotesField } from '../notes'
import { updateSavedViewAttention } from '@/features/daily-actions/attention/actions'
import { cn } from '@/lib/utils'
import type { RecordPriority, RecordStatus } from '@/types/database'

interface Props {
  board: any
  groups: any[]
  fields: any[]
  fieldVisibility?: FieldVisibilityRow[]
  records: any[]
  fieldValues: any[]
  organizationId: string
  notesByRecord?: Record<string, import('@/features/workspace/notes/queries').NotesSummary>
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

export function BoardDetailClient({ board, groups, fields, fieldVisibility, records: serverRecords, fieldValues, organizationId, notesByRecord }: Props) {
  const router = useRouter()
  const isMutating = useRef(false)

  // Phase 35F — local field order for optimistic drag-to-reorder.
  const [localFields, setLocalFields] = useState(fields)
  useEffect(() => { setLocalFields(fields) }, [fields])

  const handleReorderColumn = useCallback((draggedId: string, targetId: string) => {
    const ids = localFields.map((f: any) => f.id)
    const from = ids.indexOf(draggedId)
    if (from < 0 || !ids.includes(targetId) || draggedId === targetId) return
    const prev = localFields
    const next = [...localFields]
    const [moved] = next.splice(from, 1)
    const insertAt = next.findIndex((f: any) => f.id === targetId)
    next.splice(insertAt, 0, moved)
    setLocalFields(next)
    reorderFields(board.id, next.map((f: any) => f.id))
      .then(() => router.refresh())
      .catch(() => setLocalFields(prev))
  }, [localFields, board.id, router])

  // Phase 35G — group reorder (drag + up/down). Persisted; refresh re-fetches.
  const handleReorderGroup = useCallback((draggedId: string, targetId: string) => {
    const order = groups.map((g: any) => g.id)
    const from = order.indexOf(draggedId)
    if (from < 0 || !order.includes(targetId) || draggedId === targetId) return
    order.splice(from, 1)
    order.splice(order.indexOf(targetId), 0, draggedId)
    reorderBoardGroups(board.id, order).then(() => router.refresh()).catch(() => {})
  }, [groups, board.id, router])

  const handleMoveGroup = useCallback((groupId: string, dir: 'up' | 'down') => {
    const order = groups.map((g: any) => g.id)
    const i = order.indexOf(groupId)
    const j = dir === 'up' ? i - 1 : i + 1
    if (i < 0 || j < 0 || j >= order.length) return
    ;[order[i], order[j]] = [order[j], order[i]]
    reorderBoardGroups(board.id, order).then(() => router.refresh()).catch(() => {})
  }, [groups, board.id, router])

  // Phase 35G — board header menu (rename / duplicate structure / archive).
  const [showBoardMenu, setShowBoardMenu] = useState(false)
  const [confirmArchiveBoard, setConfirmArchiveBoard] = useState(false)
  const [boardBusy, setBoardBusy] = useState(false)
  const boardMenuRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!showBoardMenu) return
    const onDown = (e: MouseEvent) => { if (boardMenuRef.current && !boardMenuRef.current.contains(e.target as Node)) setShowBoardMenu(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [showBoardMenu])

  const onDuplicateBoard = () => {
    setShowBoardMenu(false); setBoardBusy(true)
    duplicateBoardStructure(board.id)
      .then(({ id }) => router.push(`/boards/${id}`))
      .catch((e) => { setBoardBusy(false); alert(e instanceof Error ? e.message : 'Could not duplicate board') })
  }
  const onArchiveBoard = () => {
    setConfirmArchiveBoard(false); setBoardBusy(true)
    archiveBoard(board.id)
      .then(() => { router.push('/boards'); router.refresh() })
      .catch((e) => { setBoardBusy(false); alert(e instanceof Error ? e.message : 'Could not archive board') })
  }
  // Phase 35A.3 — CRM boards are contact-centric: "Add contact" instead of
  // "Add record". Loan Pipeline (board_type 'pipeline') stays generic for now.
  const entityNoun = board.board_type === 'crm' ? 'contact' : 'record'

  // Phase 35A.1 — add a Notes column to this board (idempotent; hidden once present).
  const hasNotesColumn = useMemo(() => (fields as any[]).some((f) => isNotesField(f)), [fields])
  const onAddNotesColumn = () => {
    setShowBoardMenu(false); setBoardBusy(true)
    addNotesColumn(board.id, organizationId)
      .then(() => router.refresh())
      .catch((e) => alert(e instanceof Error ? e.message : 'Could not add Notes column'))
      .finally(() => setBoardBusy(false))
  }

  // Phase 35B — per-group column resolution. No visibility rows ⇒ every field
  // is common ⇒ identical to pre-35B behavior.
  const visibilityIndex = useMemo(() => buildVisibilityIndex(fieldVisibility), [fieldVisibility])
  const commonIds = useMemo(() => new Set(commonFieldIds(localFields, visibilityIndex)), [localFields, visibilityIndex])
  // Phase 38C-3 — non-checklist fields visible in EVERY group (no restriction OR
  // explicitly in all groups) = structurally common/client-level → Add Record Basic Info.
  const globalFieldIds = useMemo(() => {
    const out = new Set<string>()
    if (groups.length === 0) return out
    for (const f of localFields as any[]) {
      if (f.field_type === 'checklist') continue
      if (groups.every((g: any) => isFieldVisibleInGroup(f.id, g.id, visibilityIndex))) out.add(f.id)
    }
    return out
  }, [localFields, groups, visibilityIndex])
  const fieldsByGroup = useMemo(() => {
    const out: Record<string, any[]> = {}
    for (const g of groups) out[g.id] = resolveVisibleFields(localFields, g.id, visibilityIndex)
    return out
  }, [localFields, groups, visibilityIndex])

  // Phase 37B-1 — Kanban stages (columns). Modeled as Stage{boardId,groupId} even
  // though V1 is single-board, so 37B-2's board-aware drag dispatcher drops in.
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table')
  const stages = useMemo<Stage[]>(
    () => groups.map((g: any) => ({ id: g.id, boardId: board.id, groupId: g.id, label: g.name })),
    [groups, board.id],
  )

  // Phase 36B — common keys already claimed on this board (for the menu guard).
  const usedCommonKeyIds = useMemo(
    () => new Set(localFields.map((f: any) => f.common_field_key_id).filter(Boolean) as string[]),
    [localFields],
  )

  // Local record state for optimistic updates
  const [localRecords, setLocalRecords] = useState(serverRecords)
  // Phase 37B-2 — records mid-move; their (server-reset) status chip is neutralized
  // optimistically until the refresh lands. Cleared whenever server data syncs.
  const [pendingMoveIds, setPendingMoveIds] = useState<Set<string>>(new Set())

  // Sync when server data refreshes
  useEffect(() => { setLocalRecords(serverRecords); setPendingMoveIds(new Set()) }, [serverRecords])

  // Realtime
  useBoardRealtime(board.id, isMutating)

  // DnD
  const [activeRecord, setActiveRecord] = useState<any>(null)
  // 37B-2E — full drag payload (record + precomputed face / row refs) for the overlay.
  const [activeData, setActiveData] = useState<any>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  // Phase 37B-2D — presentation-only: respect prefers-reduced-motion + a short,
  // eased drop/rollback settle for the shared DragOverlay. Animation never gates
  // the move (moveRecord fires on drop in handleDragEnd, independent of this).
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReduceMotion(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  const dropAnimation: DropAnimation = {
    duration: reduceMotion ? 0 : 180,
    easing: 'cubic-bezier(0.2, 0, 0, 1)',
    sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.4' } } }),
  }

  const handleDragStart = (event: DragStartEvent) => {
    setActiveRecord(event.active.data.current?.record ?? null)
    setActiveData(event.active.data.current ?? null)
  }

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveRecord(null)
    setActiveData(null)
    if (!over) return

    // Phase 37B-2 — data-driven (works for table rows AND kanban cards). Only
    // record→drop pairs are handled here; field/column reorder is separate.
    const a = active.data.current
    const o = over.data.current
    if (a?.type !== 'record' || o?.type !== 'drop') return

    const recordId = a.recordId as string
    const fromGroupId = a.fromGroupId
    const toGroupId = o.groupId
    if (!toGroupId || fromGroupId === toGroupId) return
    // Same-board ONLY. Cross-board pipeline is deferred (37C) and unreachable in V1.
    if (a.boardId !== o.boardId) return

    // Optimistic move (powers both views; pending set neutralizes the stale status chip).
    isMutating.current = true
    setLocalRecords(prev => prev.map(r => r.id === recordId ? { ...r, group_id: toGroupId } : r))
    setPendingMoveIds(prev => { const n = new Set(prev); n.add(recordId); return n })

    try {
      // The ONE rule: route through the moveRecord() wrapper (status reset +
      // record_movements + activity in the RPC, AND record.group_changed dispatch
      // in the wrapper) — never the raw move_record RPC.
      await moveRecord(recordId, toGroupId, o.boardId)
      router.refresh()
    } catch {
      setLocalRecords(serverRecords) // rollback
      setPendingMoveIds(new Set())
    } finally {
      isMutating.current = false
    }
  }, [serverRecords, router])

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
  const [showAutomate, setShowAutomate] = useState(false)
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

  // ── Selection state (Phase 29 bulk actions) ────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])
  const toggleSelectMany = useCallback((ids: string[], on: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (on) ids.forEach((id) => next.add(id))
      else ids.forEach((id) => next.delete(id))
      return next
    })
  }, [])
  const clearSelection = useCallback(() => setSelectedIds(new Set()), [])

  // ── Subitem partition (Phase 29) — top-level records + children map ────────
  const topLevelRecords = useMemo(() => localRecords.filter((r: any) => !r.parent_record_id), [localRecords])
  const subitemsByParent = useMemo(() => {
    const out: Record<string, any[]> = {}
    for (const r of localRecords as any[]) {
      if (r.parent_record_id) (out[r.parent_record_id] ??= []).push(r)
    }
    return out
  }, [localRecords])

  // Build field values index
  const fieldValuesIndex = useMemo(() => {
    const index: Record<string, Record<string, any>> = {}
    for (const fv of fieldValues) {
      if (!index[fv.record_id]) index[fv.record_id] = {}
      index[fv.record_id][fv.field_id] = fv
    }
    return index
  }, [fieldValues])

  // Phase 35E.1 — per-group checklist summary (avg completion across its
  // records), driven by checklist fields visible in the group. No checklist
  // fields ⇒ hasChecklist:false ⇒ no summary shown.
  const checklistByGroup = useMemo(() => {
    const out: Record<string, { hasChecklist: boolean; avgPercentage: number }> = {}
    for (const g of groups) {
      const recs = topLevelRecords.filter((r: any) => r.group_id === g.id)
      let hasChecklist = false
      let sum = 0
      for (const r of recs) {
        const p = computeGroupChecklist(localFields, g.id, visibilityIndex, fieldValuesIndex[r.id] ?? {})
        if (p.hasChecklist) { hasChecklist = true; sum += p.percentage }
      }
      out[g.id] = { hasChecklist, avgPercentage: hasChecklist && recs.length > 0 ? Math.round(sum / recs.length) : 0 }
    }
    return out
  }, [groups, topLevelRecords, localFields, visibilityIndex, fieldValuesIndex])

  // Filtered records (top-level only — subitems are nested under their parent)
  const filteredRecords = useMemo(() => {
    let result = topLevelRecords
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((r: any) => r.title.toLowerCase().includes(q))
    }
    if (filterPriority) result = result.filter((r: any) => r.priority === filterPriority)
    if (filterStatus) result = result.filter((r: any) => r.status === filterStatus)
    return result
  }, [topLevelRecords, search, filterPriority, filterStatus])

  const filteredByGroup = useMemo(() =>
    groups.reduce<Record<string, any[]>>((acc, g) => {
      acc[g.id] = filteredRecords.filter((r: any) => r.group_id === g.id)
      return acc
    }, {}),
  [filteredRecords, groups])

  const totalByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = topLevelRecords.filter((r: any) => r.group_id === g.id).length
      return acc
    }, {}),
  [topLevelRecords, groups])

  // Per-stage pipeline volume — sum of existing record `value` (no new schema/math).
  const valueByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = topLevelRecords
        .filter((r: any) => r.group_id === g.id)
        .reduce((sum: number, r: any) => sum + (Number(r.value) || 0), 0)
      return acc
    }, {}),
  [topLevelRecords, groups])

  const hasAnyValue = useMemo(() => Object.values(valueByGroup).some((v) => v > 0), [valueByGroup])

  // The "active" stage to emphasize: most pipeline volume, else most records.
  const emphasizedGroupId = useMemo(() => {
    let best: string | null = null
    let bestScore = 0
    for (const g of groups) {
      const score = hasAnyValue ? (valueByGroup[g.id] ?? 0) : (totalByGroup[g.id] ?? 0)
      if (score > bestScore) { bestScore = score; best = g.id }
    }
    return best
  }, [groups, valueByGroup, totalByGroup, hasAnyValue])

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
            <Button size="sm" variant="ghost" className="text-xs h-7 gap-1" title="Automate" onClick={() => setShowAutomate(true)}>
              <Zap className="w-3.5 h-3.5" />Automate
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7" title="Settings" onClick={() => setShowSettings(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <div className="relative" ref={boardMenuRef}>
              <Button size="icon" variant="ghost" className="w-7 h-7" title="Board menu" onClick={() => setShowBoardMenu((o) => !o)}>
                {boardBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MoreVertical className="w-3.5 h-3.5" />}
              </Button>
              {showBoardMenu && (
                <div className="absolute right-0 top-8 z-50 w-52 rounded-lg border border-border bg-card p-1 shadow-xl">
                  <button type="button" onClick={() => { setShowBoardMenu(false); setShowSettings(true) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-1">
                    <Pencil className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />Rename board
                  </button>
                  <button type="button" onClick={onDuplicateBoard} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-1">
                    <Copy className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />Duplicate structure
                  </button>
                  {!hasNotesColumn && (
                    <button type="button" onClick={onAddNotesColumn} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-foreground hover:bg-surface-1">
                      <StickyNote className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />Add Notes column
                    </button>
                  )}
                  <div className="my-1 border-t border-border" />
                  <button type="button" onClick={() => { setShowBoardMenu(false); setConfirmArchiveBoard(true) }} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-destructive hover:bg-surface-1">
                    <Archive className="h-3.5 w-3.5 flex-shrink-0 text-destructive" />Archive board
                  </button>
                </div>
              )}
            </div>
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

          {/* Table | Kanban toggle (Phase 37B-1, client-only, no persistence) */}
          <div className="ml-auto inline-flex items-center rounded-md border border-border bg-surface-1 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-2xs', viewMode === 'table' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}
              title="Table view"
            >
              <Rows3 className="w-3 h-3" /> Table
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-2xs', viewMode === 'kanban' ? 'bg-card text-foreground' : 'text-muted-foreground hover:text-foreground')}
              title="Kanban view"
            >
              <LayoutGrid className="w-3 h-3" /> Kanban
            </button>
          </div>
        </div>

        {/* Board content */}
        <div className="flex flex-1 min-h-0 flex-col">
          {groups.length > 1 && (
            <div className="flex-shrink-0 px-4 pt-4">
              <BoardStageSummary
                groups={groups}
                countByGroup={totalByGroup}
                valueByGroup={valueByGroup}
                hasValues={hasAnyValue}
                emphasizedGroupId={emphasizedGroupId}
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto overflow-x-auto px-4 py-4">
            {groups.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <EmptyState icon={Columns3} title="No groups yet" description="Add your first group to start organizing records in this board.">
                  <Button size="sm" onClick={() => setShowCreateGroup(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1.5" />Add first group
                  </Button>
                </EmptyState>
              </div>
            ) : viewMode === 'kanban' ? (
              <BoardKanbanView
                stages={stages}
                recordsByGroup={filteredByGroup}
                totalByGroup={totalByGroup}
                fieldsByGroup={fieldsByGroup}
                fieldValuesIndex={fieldValuesIndex}
                fields={localFields}
                visibilityIndex={visibilityIndex}
                pendingMoveIds={pendingMoveIds}
                onSelectRecord={(id, title) => openWorkspace({ recordId: id, title })}
              />
            ) : (
              <div className="min-w-max">
                {groups.map((group, i) => (
                  <BoardGroupTable
                    key={group.id}
                    group={group}
                    records={filteredByGroup[group.id] ?? []}
                    fields={fieldsByGroup[group.id] ?? localFields}
                    commonFieldIds={commonIds}
                    usedCommonKeyIds={usedCommonKeyIds}
                    checklistSummary={checklistByGroup[group.id]}
                    onReorderColumn={handleReorderColumn}
                    onMoveGroup={handleMoveGroup}
                    onReorderGroup={handleReorderGroup}
                    isFirstGroup={i === 0}
                    isLastGroup={i === groups.length - 1}
                    fieldValuesIndex={fieldValuesIndex}
                    groups={groups}
                    boardId={board.id}
                    hasActiveFilters={hasActiveFilters}
                    totalCount={totalByGroup[group.id] ?? 0}
                    valueTotal={valueByGroup[group.id] ?? 0}
                    emphasized={group.id === emphasizedGroupId}
                    stageIndex={i}
                    subitemsByParent={subitemsByParent}
                    notesByRecord={notesByRecord}
                    onOpenNotes={(recordId) => {
                      const r = localRecords.find((x: any) => x.id === recordId)
                      openWorkspace({ recordId, title: r?.title ?? 'Record', activeSubTab: 'notes' })
                    }}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectMany={toggleSelectMany}
                    onAddRecord={() => setShowCreateRecord(group.id)}
                    onAddField={() => setShowCreateField(true)}
                    entityNoun={entityNoun}
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
        </div>

        {/* Modals */}
        <CreateGroupModal open={showCreateGroup} onClose={() => setShowCreateGroup(false)} boardId={board.id} nextPosition={groups.length} />
        <CreateFieldModal open={showCreateField} onClose={() => setShowCreateField(false)} boardId={board.id} organizationId={organizationId} nextPosition={localFields.length} />
        {showCreateRecord && (
          <CreateRecordModal
            open
            onClose={() => setShowCreateRecord(null)}
            boardId={board.id}
            groupId={showCreateRecord}
            organizationId={organizationId}
            /* Phase 38C-3 — current-group-visible fields only (same field_group_visibility
               the board table uses), NOT all-board. commonFieldIds = globally-visible set. */
            fields={fieldsByGroup[showCreateRecord] ?? localFields}
            globalFieldIds={globalFieldIds}
            groupName={groups.find((g: any) => g.id === showCreateRecord)?.name}
            boardType={board.board_type}
          />
        )}
        <BoardSettingsModal open={showSettings} onClose={() => setShowSettings(false)} board={board} />
        <AutomationsModal open={showAutomate} onClose={() => setShowAutomate(false)} board={board} organizationId={organizationId} fields={localFields} groups={groups} />

        {confirmArchiveBoard && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmArchiveBoard(false)}>
            <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="mb-2 text-sm font-semibold text-foreground">Archive this board?</h3>
              <p className="mb-3 text-xs text-muted-foreground">Records and data will be preserved, but the board will be hidden.</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmArchiveBoard(false)} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
                <button type="button" onClick={onArchiveBoard} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90">Archive board</button>
              </div>
            </div>
          </div>
        )}

        <BulkActionBar
          selectedIds={Array.from(selectedIds)}
          groups={groups}
          boardId={board.id}
          onClear={clearSelection}
        />
      </div>

      <DragOverlay dropAnimation={dropAnimation}>
        {activeData && <DragPreview data={activeData} />}
      </DragOverlay>
    </DndContext>
  )
}

/**
 * Phase 37B-2E — the lifted drag preview. Rendered inside the existing single
 * DragOverlay; reads the picked-up element's MEASURED width from dnd-kit's
 * active.rect (no manual measurement/state) so it never collapses to content
 * width. Renders the SAME precomputed face the real card already produced
 * (kanban) or a full-width row shell from the row's passed-in fields/values
 * (table) — no recompute, no data re-read.
 */
function DragPreview({ data }: { data: any }) {
  const { active } = useDndContext()
  const width = active?.rect?.current?.initial?.width
  const widthStyle = width ? { width: `${width}px` } : undefined

  if (data.view === 'kanban') {
    return (
      <div
        style={widthStyle}
        className={cn('origin-center scale-[1.02] rounded-lg border border-primary bg-card px-3 py-2.5 shadow-2xl cursor-grabbing', !widthStyle && 'w-72')}
      >
        <KanbanCardFace {...data.face} />
      </div>
    )
  }

  const fields = (data.fields ?? []) as any[]
  const fvMap = (data.fieldValueMap ?? {}) as Record<string, any>
  const cells = fields.map((f) => ({ name: f.name, value: formatCellValue(f, fvMap[f.id]) }))
  return <DragOverlayRow title={data.title} cells={cells} widthStyle={widthStyle} />
}
