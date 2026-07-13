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
import { BoardPhaseSummaryGraph } from './BoardPhaseSummaryGraph'
import { BoardSettingsModal } from './BoardSettingsModal'
import { AutomationsModal } from '@/features/workflows/components/AutomationsModal'
import { BulkActionBar } from './BulkActionBar'
import { DragOverlayRow } from './DragOverlayRow'
import { useBoardRealtime } from '@/hooks/useBoardRealtime'
import { moveRecord, reorderRecords, updateRecord, moveRecordToBoard, getMoveTargets } from '@/features/records/actions'
import { startRecordDrag, setRecordDragHover, endRecordDrag, useRecordDrag } from '../dnd/recordDragBridge'
import { useToast } from '@/features/feedback/ToastProvider'
import { buildVisibilityIndex, resolveVisibleFields, commonFieldIds, isFieldVisibleInGroup, type FieldVisibilityRow } from '@/features/fields/visibility'
import { computeGroupChecklist } from '@/features/fields/checklist'
import { pickLoanAmountFieldId, loanAmountForSum } from '@/features/fields/loanAmount'
import { reorderFields } from '@/features/fields/actions'
import { createSavedView, reorderBoardGroups, duplicateBoardStructure, archiveBoard, updateBoard, updateBoardDisplaySettings } from '../actions'
import { BOARD_RENAMED_EVENT } from './DynamicBoardsSidebarSection'
import { InlineRenameText } from '@/components/primitives/InlineRenameText'
import { addNotesColumn } from '@/features/fields/actions'
import { isNotesField } from '../notes'
import { updateSavedViewAttention } from '@/features/daily-actions/attention/actions'
import { useAuth } from '@/providers/AuthProvider'
import { LOCAL_KEYS } from '@/lib/localKeys'
import { cn } from '@/lib/utils'
import type { RecordPriority, RecordStatus } from '@/types/database'

interface Props {
  board: any
  groups: any[]
  fields: any[]
  fieldVisibility?: FieldVisibilityRow[]
  records: any[]
  fieldValues: any[]
  /** Distinct records with a non-internal communication logged since Monday
   *  (read-only; powers the week ring + per-stage progress). */
  contactedThisWeek?: { total: number; byGroup: Record<string, number> }
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

export function BoardDetailClient({ board, groups, fields, fieldVisibility, records: serverRecords, fieldValues, organizationId, notesByRecord, contactedThisWeek }: Props) {
  const router = useRouter()
  const isMutating = useRef(false)

  // Phase 35F — local field order for optimistic drag-to-reorder.
  const [localFields, setLocalFields] = useState(fields)
  useEffect(() => { setLocalFields(fields) }, [fields])

  // Phase 5M — per-board summary display prefs (hide money, etc.). Toggling only
  // changes what the header SHOWS; values/records/calculations are untouched.
  const [displaySettings, setDisplaySettings] = useState<Record<string, boolean>>(
    (board.display_settings as Record<string, boolean> | null) ?? {},
  )
  const handleChangeDisplaySettings = useCallback((next: Record<string, boolean>) => {
    const prev = displaySettings
    setDisplaySettings(next) // optimistic
    updateBoardDisplaySettings(board.id, next).catch(() => setDisplaySettings(prev)) // rollback
  }, [displaySettings, board.id])

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
  // View resolution (lead-inbox pass): the user's LAST-USED view per board
  // always wins (localStorage, keyed by user + board, strictly validated);
  // with no saved preference the board's OWN default_view (an optional
  // display_settings key, set in Board Settings) applies; kanban remains the
  // final fallback. Boards without the setting behave exactly as before.
  const { user: authUser } = useAuth()
  const boardDefaultView: 'table' | 'kanban' =
    ((board.display_settings as Record<string, unknown> | null)?.default_view === 'table' ? 'table' : 'kanban')
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>(boardDefaultView)
  const viewModeStorageKey = LOCAL_KEYS.boardViewMode(authUser?.id, board.id)
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(viewModeStorageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v === 'table' || v === 'kanban') setViewMode(v)
    } catch { /* default stands */ }
  }, [viewModeStorageKey])
  const changeViewMode = (m: 'table' | 'kanban') => {
    setViewMode(m)
    try { window.localStorage.setItem(viewModeStorageKey, m) } catch { /* view-only */ }
  }
  const stages = useMemo<Stage[]>(
    () => groups.map((g: any) => ({ id: g.id, boardId: board.id, groupId: g.id, label: g.name, color: g.color ?? null, roleLabel: g.role_label ?? null, guidanceNote: g.guidance_note ?? null })),
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

  // DnD — 37B-2E: the full drag payload (record + precomputed face / row
  // refs) drives the overlay; a separate activeRecord state was never read
  // and was removed (Step 9 lint burn-down).
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

  // ── Cross-board drop via the sidebar (record-drag bridge) ──
  // dnd-kit drags are pointer-based, so the drag survives crossing into the
  // sidebar (outside this DndContext) on its own. While a record drag is
  // live we hit-test the pointer against sidebar board rows and publish the
  // hovered target; on drop, that target wins over any dnd-kit `over`.
  const toast = useToast()
  const recordDragCleanup = useRef<(() => void) | null>(null)
  const stopRecordDragBridge = useCallback(() => {
    recordDragCleanup.current?.()
    recordDragCleanup.current = null
    return endRecordDrag()
  }, [])

  const handleDragStart = (event: DragStartEvent) => {
    setActiveData(event.active.data.current ?? null)
    const a = event.active.data.current
    if (a?.type === 'record') {
      // One-time discoverability hint (operator audit): cross-board drag is
      // invisible until tried. Shown once per browser; drag behavior itself
      // is completely untouched.
      try {
        if (!window.localStorage.getItem(LOCAL_KEYS.hintCrossBoardDrag)) {
          window.localStorage.setItem(LOCAL_KEYS.hintCrossBoardDrag, '1')
          toast.info('Tip: drop a contact on a board in the sidebar to move it there.')
        }
      } catch { /* hint only */ }
      startRecordDrag(a.recordId as string, (a.boardId ?? board.id) as string, String(a.record?.title ?? ''))
      const onMove = (e: PointerEvent) => {
        const el = document.elementFromPoint(e.clientX, e.clientY)
        const boardEl = (el?.closest?.('[data-record-drop-board]') ?? null) as HTMLElement | null
        const groupEl = (el?.closest?.('[data-record-drop-group]') ?? null) as HTMLElement | null
        const sectionEl = (el?.closest?.('[data-record-drop-section]') ?? null) as HTMLElement | null
        setRecordDragHover({
          hoverBoardId: boardEl?.dataset.recordDropBoard ?? null,
          hoverBoardName: boardEl?.dataset.recordDropName ?? null,
          hoverGroupId: groupEl?.dataset.recordDropGroup ?? null,
          hoverGroupName: groupEl?.dataset.recordDropGroupName ?? null,
          hoverSectionKey: sectionEl?.dataset.recordDropSection ?? null,
          // Over the sidebar (or its portal flyout): the drag preview goes
          // compact so it never covers the drop targets.
          overSidebar: !!(el?.closest?.('[data-app-sidebar]') || boardEl || groupEl || sectionEl),
        })
        // Edge autoscroll: nudge the sidebar's scroll container when the
        // pointer sits near its top/bottom edge during a record drag.
        const scroller = document.querySelector('[data-sidebar-scroll]') as HTMLElement | null
        if (scroller) {
          const r = scroller.getBoundingClientRect()
          if (e.clientX >= r.left - 8 && e.clientX <= r.right + 8) {
            if (e.clientY < r.top + 44) scroller.scrollTop -= 14
            else if (e.clientY > r.bottom - 44) scroller.scrollTop += 14
          }
        }
      }
      window.addEventListener('pointermove', onMove)
      recordDragCleanup.current = () => window.removeEventListener('pointermove', onMove)
    }
  }

  const handleDragCancel = useCallback(() => {
    setActiveData(null)
    recordDragCleanup.current?.()
    recordDragCleanup.current = null
    endRecordDrag()
  }, [])

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event
    setActiveData(null)
    const bridge = stopRecordDragBridge()
    const dragged = active.data.current

    // ── Cross-board move: dropped on a sidebar board row (or its stage flyout). ──
    if (dragged?.type === 'record' && bridge.hoverBoardId) {
      const recordId = dragged.recordId as string
      const toBoardId = bridge.hoverBoardId
      const toBoardName = bridge.hoverBoardName ?? 'that board'

      // Same board: a flyout stage drop is an INTENTIONAL stage move — route
      // it through the same moveRecord wrapper as any in-board stage change.
      if (toBoardId === board.id) {
        const toGroupId = bridge.hoverGroupId
        if (!toGroupId) { toast.info('Already on this board.'); return }
        if (toGroupId === dragged.fromGroupId) { toast.info('Already in that stage.'); return }
        isMutating.current = true
        setLocalRecords(prev => prev.map(r => r.id === recordId ? { ...r, group_id: toGroupId } : r))
        setPendingMoveIds(prev => { const n = new Set(prev); n.add(recordId); return n })
        try {
          await moveRecord(recordId, toGroupId, board.id)
          toast.success(`Moved to ${bridge.hoverGroupName ?? 'stage'}`)
          router.refresh()
        } catch {
          setLocalRecords(serverRecords) // rollback
          setPendingMoveIds(new Set())
          toast.error('Could not move the record — try again.')
        } finally {
          isMutating.current = false
        }
        return
      }

      isMutating.current = true
      setPendingMoveIds(prev => new Set(prev).add(recordId))
      try {
        // Destination stage: the flyout's explicit stage when one was hovered,
        // else the destination board's FIRST group (its own position order) —
        // never guessed, never created. No groups → block.
        let toGroupId = bridge.hoverGroupId
        let destLabel = bridge.hoverGroupId ? `${toBoardName} · ${bridge.hoverGroupName ?? 'stage'}` : toBoardName
        if (!toGroupId) {
          const targets = await getMoveTargets()
          const dest = targets.find((t) => t.id === toBoardId)
          toGroupId = dest?.groups[0]?.id ?? null
          destLabel = toBoardName
        }
        if (!toGroupId) {
          toast.error(`"${toBoardName}" has no stages to receive records.`)
          return
        }
        // Optimistic: the record (and its subitems) leave this board now.
        setLocalRecords(prev => prev.filter(r => r.id !== recordId && r.parent_record_id !== recordId))
        const res = await moveRecordToBoard(recordId, toBoardId, toGroupId)
        if ('error' in res) {
          setLocalRecords(serverRecords) // rollback — the card returns
          toast.error('Could not move the record — try again.')
          return
        }
        toast.success(`Moved to ${destLabel}`)
        router.refresh()
      } catch {
        setLocalRecords(serverRecords) // rollback
        toast.error('Could not move the record — try again.')
      } finally {
        setPendingMoveIds(prev => { const n = new Set(prev); n.delete(recordId); return n })
        isMutating.current = false
      }
      return
    }

    if (!over) return

    // Phase 37B-2 — data-driven (works for table rows AND kanban cards). Only
    // record→drop pairs are handled here; field/column reorder is separate.
    const a = active.data.current
    const o = over.data.current
    if (a?.type !== 'record' || !o) return

    // Drop target is either a column ('drop') or another card ('record-drop', Kanban reorder).
    const toGroupId: string | undefined = (o.type === 'drop' || o.type === 'record-drop') ? o.groupId : undefined
    if (!toGroupId) return
    // Same-board ONLY. Cross-board pipeline is deferred (37C) and unreachable in V1.
    if (a.boardId !== o.boardId) return

    const recordId = a.recordId as string
    const fromGroupId = a.fromGroupId

    // ── Same-column REORDER (Phase 4F): dropped onto another card in the same group. ──
    if (o.type === 'record-drop' && o.groupId === fromGroupId) {
      const targetId = o.recordId as string
      if (targetId === recordId) return

      // Insert before/after the target by comparing the dragged card's center to the target's.
      const ar = active.rect.current.translated
      const orc = over.rect
      const after = !!(ar && orc) && (ar.top + ar.height / 2) > (orc.top + orc.height / 2)

      // Full (unfiltered) group order, in current position order from localRecords.
      const groupIds: string[] = localRecords
        .filter((r) => r.group_id === fromGroupId && !r.parent_record_id)
        .map((r) => r.id)
      const without = groupIds.filter((id) => id !== recordId)
      let idx = without.indexOf(targetId)
      if (idx === -1) return
      if (after) idx += 1
      without.splice(idx, 0, recordId)
      const orderedIds = without
      if (orderedIds.join() === groupIds.join()) return // no-op

      // Persist only the records whose position actually changed (minimal writes).
      const changed = orderedIds
        .map((id, i) => ({ id, position: i }))
        .filter(({ id, position }) => {
          const rec = localRecords.find((r) => r.id === id)
          return rec && rec.position !== position
        })

      // Optimistic: rewrite the group's records into the new order + positions.
      // filteredByGroup preserves array order, so this reflects immediately.
      isMutating.current = true
      const posById = new Map(orderedIds.map((id, i) => [id, i]))
      setLocalRecords(prev => {
        const inGroup = new Map(
          prev.filter((r) => r.group_id === fromGroupId && !r.parent_record_id).map((r) => [r.id, r]),
        )
        let k = 0
        return prev.map((r) => {
          if (r.group_id === fromGroupId && !r.parent_record_id) {
            const id = orderedIds[k++]
            return { ...inGroup.get(id), position: posById.get(id) }
          }
          return r
        })
      })

      try {
        await reorderRecords(a.boardId, changed)
        router.refresh()
      } catch {
        setLocalRecords(serverRecords) // rollback
      } finally {
        isMutating.current = false
      }
      return
    }

    // ── Cross-column MOVE (column drop, or a card-drop in a different group). ──
    if (fromGroupId === toGroupId) return // same-group column drop (empty area) — no-op

    // Optimistic move (powers both views; pending set neutralizes the stale status chip).
    isMutating.current = true
    setLocalRecords(prev => prev.map(r => r.id === recordId ? { ...r, group_id: toGroupId } : r))
    setPendingMoveIds(prev => { const n = new Set(prev); n.add(recordId); return n })

    try {
      // The ONE rule: route through the moveRecord() wrapper (status reset +
      // record_movements + activity in the RPC, AND record.group_changed dispatch
      // in the wrapper) — never the raw move_record RPC.
      await moveRecord(recordId, toGroupId, a.boardId)
      router.refresh()
    } catch {
      setLocalRecords(serverRecords) // rollback
      setPendingMoveIds(new Set())
    } finally {
      isMutating.current = false
    }
  }, [serverRecords, router, localRecords, board.id, toast, stopRecordDragBridge])

  const handleOptimisticMove = useCallback((recordId: string, toGroupId: string) => {
    isMutating.current = true
    setLocalRecords(prev => prev.map(r => r.id === recordId ? { ...r, group_id: toGroupId } : r))
    setTimeout(() => { isMutating.current = false }, 2000)
  }, [])

  // Inline record rename (Kanban card / table row titles) — the existing
  // updateRecord write path (records.title only), optimistic with rollback.
  const handleRenameRecord = useCallback(async (recordId: string, title: string) => {
    const prev = localRecords
    setLocalRecords(prev.map((r: { id: string }) => (r.id === recordId ? { ...r, title } : r)))
    try {
      await updateRecord(recordId, board.id, { title })
      router.refresh()
    } catch (e) {
      setLocalRecords(prev) // rollback
      throw e
    }
  }, [localRecords, board.id, router])

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

  // Visible (post-filter/search) count per group — drives the phase summary graph
  // so it always matches the cards/rows shown below. Equals the full board when
  // no filter/search is active.
  const filteredCountByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = (filteredByGroup[g.id] ?? []).length
      return acc
    }, {}),
  [filteredByGroup, groups])

  // Cross-screen amount source of truth (data-mapping audit): a record's dollar
  // amount is its loan_amount FIELD value — the same source the contact card,
  // Kanban card, and hover preview display — falling back to the legacy
  // records.value column for records that only carry that. Same resolution
  // order the prospecting queue already uses. Read-only; no new query.
  const amountFieldId = useMemo(() => pickLoanAmountFieldId(localFields), [localFields])
  const recordAmount = useCallback((r: { id: string; value?: number | string | null }): number => {
    const n = amountFieldId ? fieldValuesIndex[r.id]?.[amountFieldId]?.value_number : null
    return loanAmountForSum(n, r.value)
  }, [amountFieldId, fieldValuesIndex])

  // Visible (post-filter/search) loan volume per group — sum of each record's
  // amount (loan_amount field, else legacy record value), scoped to the same
  // filtered set as the count (no new query) so the graph's amounts stay
  // consistent with what's shown below.
  const filteredValueByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = (filteredByGroup[g.id] ?? []).reduce((sum: number, r: any) => sum + recordAmount(r), 0)
      return acc
    }, {}),
  [filteredByGroup, groups, recordAmount])

  // Visible records that actually carry a loan value — lets the header show a
  // safe average (total value ÷ valued records), excluding $0/blank records so
  // the average isn't diluted. Same filtered set, no new query.
  const filteredValuedCountByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = (filteredByGroup[g.id] ?? []).filter((r: any) => recordAmount(r) > 0).length
      return acc
    }, {}),
  [filteredByGroup, groups, recordAmount])

  const totalByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = topLevelRecords.filter((r: any) => r.group_id === g.id).length
      return acc
    }, {}),
  [topLevelRecords, groups])

  // Per-stage pipeline volume — sum of each record's amount (loan_amount field,
  // else legacy record value; no new schema/math).
  const valueByGroup = useMemo(() =>
    groups.reduce<Record<string, number>>((acc, g) => {
      acc[g.id] = topLevelRecords
        .filter((r: any) => r.group_id === g.id)
        .reduce((sum: number, r: any) => sum + recordAmount(r), 0)
      return acc
    }, {}),
  [topLevelRecords, groups, recordAmount])

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
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={handleDragCancel}>
      {/* jubo-los-scope: re-themes the board subtree to the warm LOS-light
          palette (cream surfaces / tan borders / dusty-red primary) via scoped
          token overrides; the dark app shell remains the navy frame. */}
      <div className="jubo-los-scope flex flex-col h-full min-h-0">
        {/* Header redesign — Row 1: slim navy identity strip (back · name ·
            type badge). The rename affordance lives here; the big title below
            is display-only, matching the reference. */}
        <div className="jubo-navy-chrome flex flex-shrink-0 items-center gap-3 bg-jubo-navy px-4 py-2">
          <Link href="/boards" className="flex-shrink-0 text-white/60 transition-colors hover:text-white">
            <ChevronLeft className="w-4 h-4" />
          </Link>
          <h2 className="flex min-w-0 items-center gap-1 text-sm font-bold leading-5 text-white">
            {/* Inline rename — existing updateBoard action (boards.name only);
                the sidebar picks the change up via the rename event. */}
            <InlineRenameText
              value={board.name}
              pencil
              className="truncate"
              inputClassName="text-sm font-bold bg-white/10 border-white/30 text-white focus:ring-white/50"
              onSave={async (next) => {
                await updateBoard(board.id, { name: next })
                window.dispatchEvent(new CustomEvent(BOARD_RENAMED_EVENT, { detail: { boardId: board.id, name: next } }))
                router.refresh()
              }}
            />
          </h2>
          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/70">{board.board_type}</span>
        </div>

        {/* Row 2 — big title (left) + the full toolbar (right): view toggle ·
            search · filters · + Group · Automate · settings · menu. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border px-4 pb-2.5 pt-3 flex-shrink-0">
          <div className="flex min-w-0 items-center gap-2.5">
            {board.color && <div className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ backgroundColor: board.color }} />}
            <h1 className="truncate text-xl font-bold leading-tight tracking-tight text-jubo-navy" title={board.description || board.name}>
              {board.name}
            </h1>
            <span className="flex-shrink-0 whitespace-nowrap rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{board.board_type}</span>
            <span className="flex-shrink-0 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
              {topLevelRecords.length} {topLevelRecords.length === 1 ? 'contact' : 'contacts'}
            </span>
          </div>
          {/* Lead-inbox purpose line — the PROSPECTING board only (matched by
              slug/name): says what this board is for vs the Daily Call Log.
              Copy only; no data, stages, or behavior change. */}
          {(board.slug === 'prospecting' || (board.name ?? '').trim().toLowerCase() === 'prospecting') && (
            <p className="w-full text-xs text-muted-foreground sm:w-auto sm:flex-1 sm:truncate" title="Raw lead inbox for new, unworked, and early-stage leads. Use Daily Call Log for your daily calling workflow.">
              Raw lead inbox — new &amp; unworked leads land here. Daily calling lives in the{' '}
              <Link href="/prospecting" className="font-medium text-jubo-red hover:underline">Daily Call Log</Link>.
            </p>
          )}
          <div className="ml-auto flex flex-wrap items-center gap-1.5">

          {/* Kanban | Table toggle — the chosen view is remembered per board
              (per-browser preference; no board data is touched). */}
          <div className="inline-flex items-center rounded-md border border-border bg-jubo-card-soft p-0.5">
            <button
              onClick={() => changeViewMode('kanban')}
              className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-2xs transition-colors', viewMode === 'kanban' ? 'bg-jubo-navy text-white' : 'text-jubo-text-soft hover:text-jubo-text')}
              title="Kanban view"
            >
              <LayoutGrid className="w-3 h-3" /> Kanban
            </button>
            <button
              onClick={() => changeViewMode('table')}
              className={cn('inline-flex items-center gap-1 rounded px-2 py-1 text-2xs transition-colors', viewMode === 'table' ? 'bg-jubo-navy text-white' : 'text-jubo-text-soft hover:text-jubo-text')}
              title="Table view"
            >
              <Rows3 className="w-3 h-3" /> Table
            </button>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search records…"
              className="pl-8 pr-8 py-1.5 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-jubo-navy w-48"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <Button
            size="sm" variant="ghost"
            className={cn('h-7 text-xs gap-1.5', (filterPriority || filterStatus) && 'text-jubo-navy')}
            onClick={() => setShowFilters(f => !f)}
          >
            <SlidersHorizontal className="w-3 h-3" />
            Filters
            {(filterPriority || filterStatus) && <span className="w-1.5 h-1.5 rounded-full bg-jubo-navy" />}
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
                className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-jubo-navy w-32"
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
                  className="h-7 px-1.5 text-2xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-jubo-navy capitalize"
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
              <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as RecordPriority | '')} className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-jubo-navy">
                {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as RecordStatus | '')} className="h-7 px-2 text-xs bg-surface-1 border border-border rounded-md text-foreground focus:outline-none focus:border-jubo-navy">
                {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          )}
            <div aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
            <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 rounded-lg border border-border bg-card" onClick={() => setShowCreateGroup(true)}>
              <Plus className="w-3 h-3" />Group
            </Button>
            <Button size="sm" variant="ghost" className="text-xs h-7 gap-1 rounded-lg border border-border bg-card" title="Automate" onClick={() => setShowAutomate(true)}>
              <Zap className="w-3.5 h-3.5" />Automate
            </Button>
            <Button size="icon" variant="ghost" className="w-7 h-7 rounded-lg border border-border bg-card" title="Settings" onClick={() => setShowSettings(true)}>
              <Settings className="w-3.5 h-3.5" />
            </Button>
            <div className="relative" ref={boardMenuRef}>
              <Button size="icon" variant="ghost" className="w-7 h-7 rounded-lg border border-border bg-card" title="Board menu" onClick={() => setShowBoardMenu((o) => !o)}>
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



        {/* Board content */}
        <div className="flex flex-1 min-h-0 flex-col">
          {groups.length > 1 && (
            <div className="flex-shrink-0 px-4 pt-2">
              <BoardPhaseSummaryGraph
                groups={groups}
                countByGroup={filteredCountByGroup}
                valueByGroup={filteredValueByGroup}
                valuedCountByGroup={filteredValuedCountByGroup}
                contactedThisWeek={contactedThisWeek}
                settings={displaySettings}
                onChangeSettings={handleChangeDisplaySettings}
              />
            </div>
          )}
          <div className="flex-1 overflow-y-auto overflow-x-auto px-4 pb-4 pt-2">
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
                onAddRecord={(groupId) => setShowCreateRecord(groupId)}
                onRenameRecord={handleRenameRecord}
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
                      // Notes now live inside the File Card's Overview; open the card.
                      openWorkspace({ recordId, title: r?.title ?? 'Record' })
                    }}
                    selectedIds={selectedIds}
                    onToggleSelect={toggleSelect}
                    onToggleSelectMany={toggleSelectMany}
                    onAddRecord={() => setShowCreateRecord(group.id)}
                    onAddField={() => setShowCreateField(true)}
                    entityNoun={entityNoun}
                    onRenameRecord={handleRenameRecord}
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

      {/* pointer-events: none keeps elementFromPoint hit-testing (the sidebar
          cross-board bridge) seeing through the drag ghost. */}
      <DragOverlay dropAnimation={dropAnimation} style={{ pointerEvents: 'none' }}>
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

  // Over the sidebar the full card/row preview would cover the drop targets —
  // morph to a compact pill (initials + name) so the destination boards and
  // the stage flyout stay fully visible while "carrying" the record.
  const recordDrag = useRecordDrag()
  if (recordDrag.overSidebar && data.type === 'record') {
    return <CompactDragPill title={String(data.record?.title ?? recordDrag.title ?? 'Record')} />
  }

  if (data.view === 'kanban') {
    // Kanban cards are narrow. Clamp the lifted preview to a card-sized width and
    // always provide a concrete fallback, so it can NEVER stretch across the
    // screen even if the measured rect is missing or wrong. (Table rows below
    // intentionally keep their full measured width.)
    const kanbanWidth = width && width > 0 ? Math.min(width, 340) : 288
    return (
      <div
        style={{ width: kanbanWidth }}
        className="jubo-los-scope relative block origin-center scale-[1.02] overflow-hidden rounded-xl border border-jubo-border-strong bg-jubo-card px-3 py-2.5 shadow-2xl cursor-grabbing"
      >
        <KanbanCardFace {...data.face} />
      </div>
    )
  }

  const fields = (data.fields ?? []) as any[]
  const fvMap = (data.fieldValueMap ?? {}) as Record<string, any>
  const cells = fields.map((f) => ({ name: f.name, value: formatCellValue(f, fvMap[f.id]) }))
  return <div className="jubo-los-scope"><DragOverlayRow title={data.title} cells={cells} widthStyle={widthStyle} /></div>
}

/** Compact drag preview shown while the pointer is over the sidebar: a small
 *  pill (initials + name) that never covers the destination boards or the
 *  stage flyout. */
function CompactDragPill({ title }: { title: string }) {
  const words = title.trim().split(/\s+/)
  const initials = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase() || '•'
  return (
    <div className="jubo-los-scope flex w-fit max-w-[220px] cursor-grabbing items-center gap-2 rounded-full border border-jubo-border-strong bg-jubo-card py-1 pl-1 pr-3 shadow-2xl">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-jubo-gold-soft text-[10px] font-bold text-jubo-gold">
        {initials}
      </span>
      <span className="truncate text-xs font-semibold text-foreground">{title}</span>
    </div>
  )
}
