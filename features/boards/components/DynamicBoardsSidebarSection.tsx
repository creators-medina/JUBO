'use client'

// ─────────────────────────────────────────────────────────────────────────
// DynamicBoardsSidebarSection — the workflow-first board nav (Board Redesign
// reference): a "Work Loans Pipeline" summary card, then two segmented
// sections built around what a loan officer does all day:
//   • GENERATE   — leads & partners (Conversations + every non-pipeline board)
//   • WORK LOANS — active pipeline (boards with board_type 'pipeline', plus
//                  journey-named boards), with real counts and dollar totals.
//
// All numbers are REAL and READ-ONLY: org-scoped, RLS-protected queries drive
// the per-board count pills, the rolled-up section counts, and the pipeline
// card. Dollar totals resolve each record's base loan amount the SAME way the
// board header does — the loan_amount FIELD value (field_values), falling back
// to the legacy records.value column — so header and sidebar never contradict.
// Nothing is written except the existing boards.position reorder.
//
// Sections are PRESENTATION-ONLY (derived from stored board_type + name
// fallback). Drag-to-reorder works on the full flat list so the global
// boards.position order is preserved. Dropping onto a board in the OTHER
// section also moves the dragged board into that section — as a per-browser
// display override (useSidebarSectionOverrides), because board_type drives
// real behavior (workspace card templates, workflow conditions) and must
// never be mutated by a drag. Org-wide grouping stays a backend phase.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Columns3, MessageSquare, Plus, UserPlus, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/providers/OrganizationProvider'
import { reorderBoards, updateBoard } from '@/features/boards/actions'
import { isWorkLoansBoard } from '@/features/boards/workLoans'
import { useSidebarSectionCollapsed } from '@/hooks/useSidebarSectionCollapsed'
import { useSidebarSectionLabel } from '@/hooks/useSidebarSectionLabel'
import { useSidebarSlot } from '@/hooks/useSidebarSlot'
import { useSidebarSectionOverrides, type SidebarSectionKey } from '@/hooks/useSidebarSectionOverrides'
import { useRecordDrag } from '../dnd/recordDragBridge'
import { getMoveTargets } from '@/features/records/actions'
import { InlineRenameText } from '@/components/primitives/InlineRenameText'
import { formatVolume } from './BoardStageSummary'
import { pickLoanAmountFieldId, resolveLoanAmount } from '@/features/fields/loanAmount'
import { isClosedGroupName, isOpenPipelineRecord } from '@/features/metrics/shared'
import { cn } from '@/lib/utils'

/** Cross-component board-rename signal (e.g. renamed from the board page
 *  header) so this client-fetched list updates without a full reload. */
export const BOARD_RENAMED_EVENT = 'jubo:board-renamed'

interface Board {
  id: string
  name: string
  board_type: string
  color: string | null
  position?: number
}

type RecordRow = { id: string; board_id: string | null; group_id: string | null; status: string | null; value: number | null; parent_record_id: string | null }

// isWorkLoansBoard lives in the server-safe '@/features/boards/workLoans' util
// (imported above) so server code — the dashboard overview queries — can call it
// without crossing the client boundary. boardSectionKey stays here (client-only).

/** Display group for a board: the per-browser override (drag between groups)
 *  first, then the derived classification. Shared by the sidebar and the All
 *  Boards page so the two groupings never disagree. */
export function boardSectionKey(
  b: { id: string; name: string; board_type: string },
  overrides: Record<string, SidebarSectionKey>,
): SidebarSectionKey {
  return overrides[b.id] ?? (isWorkLoansBoard(b) ? 'workloans' : 'generate')
}

// Drag payload key — distinct so it can't collide with other native DnD in the app.
const DND_TYPE = 'text/jubo-board-id'
// "All Boards" placement — its own payload type (exported: the shell's nav
// groups accept this drag too). The item renders INSIDE a group's item list
// as a normal row; its position is "<group>:<index>". Groups cover the board
// sections here (generate/workloans) AND the shell nav groups (utility/
// insights/setup), so All Boards can move anywhere in the sidebar — without
// ever inventing a fake board record.
export const ALLBOARDS_DND_TYPE = 'text/jubo-allboards'
// Board section headers swap order via their own drag type.
const BOARDSECTION_DND_TYPE = 'text/jubo-boardsection'
type SectionKey = SidebarSectionKey
export type AllBoardsGroup = SectionKey | 'utility' | 'insights' | 'setup'
type AllBoardsPlacement = { section: AllBoardsGroup; index: number }
export function parseAllBoardsSlot(raw: string): AllBoardsPlacement {
  // Legacy coarse slots (first movable version) map into the list model.
  if (raw === 'top') return { section: 'generate', index: 0 }
  if (raw === 'between') return { section: 'workloans', index: 0 }
  const m = /^(generate|workloans|utility|insights|setup):(\d+)$/.exec(raw)
  if (m) return { section: m[1] as AllBoardsGroup, index: Number(m[2]) }
  // 'bottom' / default / malformed → end of the Work Loans list (the item's
  // historical home at the bottom of the board nav).
  return { section: 'workloans', index: Number.MAX_SAFE_INTEGER }
}

export function DynamicBoardsSidebarSection({ collapsed, filter = '' }: { collapsed: boolean; filter?: string }) {
  const { currentOrganization } = useOrganization()
  const pathname = usePathname()
  const router = useRouter()
  const [boards, setBoards] = useState<Board[]>([])
  const [recordRows, setRecordRows] = useState<RecordRow[]>([])
  // record_id → its board's loan_amount FIELD value (value_number), when set.
  const [loanByRecord, setLoanByRecord] = useState<Map<string, number>>(new Map())
  // Funded/closed stage ids (shared classifier) — see the pipeline card memo.
  const [closedGroupIds, setClosedGroupIds] = useState<Set<string>>(new Set())
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  // Board currently being renamed inline — pauses that item's drag + navigation.
  const [renamingBoardId, setRenamingBoardId] = useState<string | null>(null)

  // Monday-style collapsible groups (localStorage-persisted, default open).
  const generateSection = useSidebarSectionCollapsed('generate')
  const workLoansSection = useSidebarSectionCollapsed('workloans')
  // Editable section labels (double-click) — same per-browser localStorage
  // convention as the collapse state; the sections themselves are derived,
  // so there is no backend column to write.
  const generateLabel = useSidebarSectionLabel('generate', 'Generate')
  const workLoansLabel = useSidebarSectionLabel('workloans', 'Work Loans')
  // "All Boards" is a static route (NOT a board record), so it can't join the
  // boards.position reorder. It renders as a normal row inside the section
  // lists; where it sits is a per-browser preference ("<section>:<index>") —
  // drag it onto any board to move it there, exactly like reordering a board.
  const allBoardsSlot = useSidebarSlot('allboards', 'bottom')
  const allBoardsPlacement = parseAllBoardsSlot(allBoardsSlot.slot)
  const [draggingAllBoards, setDraggingAllBoards] = useState(false)
  // Section block order — drag one section header onto the other to swap
  // (per-browser preference, like every other sidebar layout choice).
  const boardSectionsOrder = useSidebarSlot('boardsections', 'generate-first')
  // Per-browser Generate ↔ Work Loans placement overrides (drag between
  // groups). Display-only — board_type is never mutated by a drag.
  const { overrides: sectionOverrides, setOverride: setSectionOverride } = useSidebarSectionOverrides()
  // Live record drag from the board area (cross-board move): while active,
  // every board row here is a drop target; the hovered one highlights and
  // grows a stage flyout so the drop can target a specific stage.
  const recordDrag = useRecordDrag()
  // Stage lists per board for the flyout — fetched once, on the first record
  // drag of the session (read-only getMoveTargets; null = not loaded yet).
  const [stagesByBoard, setStagesByBoard] = useState<Map<string, { id: string; name: string }[]> | null>(null)
  useEffect(() => {
    if (!recordDrag.recordId || stagesByBoard !== null) return
    let cancelled = false
    getMoveTargets()
      .then((targets) => {
        if (!cancelled) setStagesByBoard(new Map(targets.map((t) => [t.id, t.groups])))
      })
      .catch(() => { /* stays null → retried on the next drag */ })
    return () => { cancelled = true }
  }, [recordDrag.recordId, stagesByBoard])

  // Dwell-to-expand: hovering a COLLAPSED section header for a beat during a
  // record drag opens it so its boards become droppable.
  const forceOpenGenerateRef = generateSection.forceOpen
  const forceOpenWorkLoansRef = workLoansSection.forceOpen
  useEffect(() => {
    if (!recordDrag.recordId || !recordDrag.hoverSectionKey) return
    const key = recordDrag.hoverSectionKey
    const id = window.setTimeout(() => {
      if (key === 'generate') forceOpenGenerateRef()
      else if (key === 'workloans') forceOpenWorkLoansRef()
    }, 350)
    return () => window.clearTimeout(id)
  }, [recordDrag.recordId, recordDrag.hoverSectionKey, forceOpenGenerateRef, forceOpenWorkLoansRef])

  useEffect(() => {
    if (!currentOrganization) return
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      // Boards in the persisted sidebar order (boards.position, phase5l), with a
      // created_at fallback if the column isn't in the DB yet (pre-migration).
      const withPos = await supabase
        .from('boards')
        .select('id, name, board_type, color, position')
        .eq('organization_id', currentOrganization.id)
        .eq('is_archived', false)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
      let rows: Board[] = (withPos.data ?? []) as Board[]
      if (withPos.error) {
        const fallback = await supabase
          .from('boards')
          .select('id, name, board_type, color')
          .eq('organization_id', currentOrganization.id)
          .eq('is_archived', false)
          .order('created_at', { ascending: true })
        rows = (fallback.data ?? []) as Board[]
      }
      if (!cancelled) setBoards(rows)

      // READ-ONLY aggregate source: tiny columns per active record, org-scoped
      // by RLS. Drives counts + pipeline value; never written.
      const recs = await supabase
        .from('records')
        .select('id, board_id, group_id, status, value, parent_record_id')
        .eq('organization_id', currentOrganization.id)
        .eq('is_archived', false)
      if (!cancelled) setRecordRows(((recs.data ?? []) as RecordRow[]))

      // Funded/closed stage ids (shared classifier) — the pipeline card
      // excludes records sitting in them, matching the Dashboard's Active
      // pipeline population exactly. Board nav count pills stay unfiltered
      // (they mirror everything on the board).
      const { data: groupRows } = await supabase
        .from('board_groups')
        .select('id, name')
        .eq('organization_id', currentOrganization.id)
      if (!cancelled) {
        setClosedGroupIds(new Set(
          ((groupRows ?? []) as { id: string; name: string }[])
            .filter((g) => isClosedGroupName(g.name))
            .map((g) => g.id),
        ))
      }

      // Resolve each record's base loan amount the SAME way the board header
      // does: the loan_amount FIELD value. Load the org's currency fields, pick
      // the loan-amount field per board (precisely — not appraised/property
      // value), then read only those fields' values. Read-only; no writes.
      const { data: fieldRows } = await supabase
        .from('fields')
        .select('id, board_id, slug, name, field_type, common_field_key_id, is_default_status')
        .eq('organization_id', currentOrganization.id)
        .eq('field_type', 'currency')
      const byBoard = new Map<string, typeof fieldRows>()
      for (const f of (fieldRows ?? [])) {
        const arr = byBoard.get(f.board_id as string) ?? []
        arr.push(f); byBoard.set(f.board_id as string, arr)
      }
      const loanFieldIds: string[] = []
      for (const arr of byBoard.values()) {
        const id = pickLoanAmountFieldId(arr ?? [])
        if (id) loanFieldIds.push(id)
      }
      const map = new Map<string, number>()
      if (loanFieldIds.length > 0) {
        const { data: fvRows } = await supabase
          .from('field_values')
          .select('record_id, field_id, value_number')
          .in('field_id', loanFieldIds)
        for (const fv of (fvRows ?? [])) {
          if (typeof fv.value_number === 'number') map.set(fv.record_id as string, fv.value_number)
        }
      }
      if (!cancelled) setLoanByRecord(map)
    })()
    return () => { cancelled = true }
  }, [currentOrganization])

  // Reflect renames made elsewhere (board page header) without a reload.
  useEffect(() => {
    const onRenamed = (e: Event) => {
      const { boardId, name } = (e as CustomEvent<{ boardId: string; name: string }>).detail ?? {}
      if (!boardId || !name) return
      setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name } : b)))
    }
    window.addEventListener(BOARD_RENAMED_EVENT, onRenamed)
    return () => window.removeEventListener(BOARD_RENAMED_EVENT, onRenamed)
  }, [])

  // Sidebar inline rename — the existing updateBoard action (boards.name only),
  // optimistic with rollback; router.refresh syncs the board page header.
  const renameBoard = async (boardId: string, name: string) => {
    const prev = boards
    setBoards(prev.map((b) => (b.id === boardId ? { ...b, name } : b)))
    try {
      await updateBoard(boardId, { name })
      router.refresh()
    } catch (e) {
      setBoards(prev) // rollback
      throw e
    }
  }

  // Per-board rollups from the records read (top-level records only) — feeds
  // the nav count pills, which mirror EVERYTHING on a board.
  const statsByBoard = useMemo(() => {
    const m = new Map<string, { count: number; value: number; valued: number }>()
    for (const r of recordRows) {
      if (!r.board_id || r.parent_record_id) continue
      const s = m.get(r.board_id) ?? { count: 0, value: 0, valued: 0 }
      s.count += 1
      // Loan_amount field value first, then legacy records.value — same order as
      // the board header, so the two totals agree.
      const v = resolveLoanAmount(loanByRecord.get(r.id) ?? null, r.value)
      if (v != null && v > 0) { s.value += v; s.valued += 1 }
      m.set(r.board_id, s)
    }
    return m
  }, [recordRows, loanByRecord])

  // Step 4 (pipeline-total consistency): the PIPELINE CARD counts only the
  // Dashboard's "Active pipeline" population — active records in OPEN stages
  // (shared isOpenPipelineRecord rule; funded/closed stages excluded) — so
  // the sidebar's dollar total can never disagree with the Dashboard's.
  const pipelineStatsByBoard = useMemo(() => {
    const m = new Map<string, { count: number; value: number; valued: number }>()
    for (const r of recordRows) {
      if (!r.board_id || r.parent_record_id) continue
      if (r.group_id && closedGroupIds.has(r.group_id)) continue
      if (!isOpenPipelineRecord(r.status, null)) continue // status gate (group handled above)
      const s = m.get(r.board_id) ?? { count: 0, value: 0, valued: 0 }
      s.count += 1
      const v = resolveLoanAmount(loanByRecord.get(r.id) ?? null, r.value)
      if (v != null && v > 0) { s.value += v; s.valued += 1 }
      m.set(r.board_id, s)
    }
    return m
  }, [recordRows, loanByRecord, closedGroupIds])

  const generateBoards = useMemo(
    () => boards.filter((b) => boardSectionKey(b, sectionOverrides) === 'generate'),
    [boards, sectionOverrides],
  )
  const workLoanBoards = useMemo(
    () => boards.filter((b) => boardSectionKey(b, sectionOverrides) === 'workloans'),
    [boards, sectionOverrides],
  )

  // Keep the active board discoverable: force its section open when the route
  // points inside it (runs on route/board changes only — a manual collapse on
  // the same route is respected because toggle/forceOpen are stable callbacks).
  const forceOpenGenerate = generateSection.forceOpen
  const forceOpenWorkLoans = workLoansSection.forceOpen
  useEffect(() => {
    const activeBoard = boards.find((b) => pathname === `/boards/${b.id}`)
    if (!activeBoard) return
    if (boardSectionKey(activeBoard, sectionOverrides) === 'workloans') forceOpenWorkLoans()
    else forceOpenGenerate()
  }, [pathname, boards, sectionOverrides, forceOpenGenerate, forceOpenWorkLoans])

  const q = filter.trim().toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  const sectionCount = (list: Board[]) => list.reduce((s, b) => s + (statsByBoard.get(b.id)?.count ?? 0), 0)
  const pipeline = useMemo(() => {
    let value = 0, count = 0, valued = 0
    for (const b of workLoanBoards) {
      const s = pipelineStatsByBoard.get(b.id)
      if (!s) continue
      value += s.value; count += s.count; valued += s.valued
    }
    return { value, count, avg: valued > 0 ? value / valued : 0 }
  }, [workLoanBoards, pipelineStatsByBoard])

  // Reorder within the flat list (preserves global boards.position semantics).
  // Dropping onto a board in the OTHER group also moves the dragged board into
  // that group — stored as a per-browser display override, never by mutating
  // board_type (which drives card templates and workflow conditions).
  const reorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const from = boards.findIndex((b) => b.id === draggedId)
    const to = boards.findIndex((b) => b.id === targetId)
    if (from < 0 || to < 0) return
    const targetSection = boardSectionKey(boards[to], sectionOverrides)
    if (boardSectionKey(boards[from], sectionOverrides) !== targetSection) {
      // Clear the override when the board returns to its derived group.
      const derived: SectionKey = isWorkLoansBoard(boards[from]) ? 'workloans' : 'generate'
      setSectionOverride(draggedId, targetSection === derived ? null : targetSection)
    }
    const prev = boards
    const next = boards.filter((b) => b.id !== draggedId)
    const targetIdx = next.findIndex((b) => b.id === targetId)
    const insertAt = from < to ? targetIdx + 1 : targetIdx
    next.splice(insertAt, 0, boards[from])
    setBoards(next) // optimistic
    reorderBoards(next.map((b) => b.id)).catch(() => setBoards(prev)) // rollback on failure
  }

  // Drop the All Boards row onto a board — same semantics as board reorder:
  // moving down lands after the target, moving up (or arriving from the other
  // section) lands before it. Persists to the per-browser slot preference;
  // boards.position is never touched.
  const placeAllBoards = (targetBoardId: string) => {
    const target = boards.find((b) => b.id === targetBoardId)
    if (!target) return
    const section: SectionKey = boardSectionKey(target, sectionOverrides)
    const list = section === 'workloans' ? workLoanBoards : generateBoards
    const k = list.findIndex((b) => b.id === targetBoardId)
    if (k < 0) return
    const cur = allBoardsPlacement
    const movingDown = cur.section === section && Math.min(cur.index, list.length) <= k
    allBoardsSlot.setSlot(`${section}:${movingDown ? k + 1 : k}`)
  }

  const renderBoard = (board: Board, draggable: boolean) => {
    const active = pathname === `/boards/${board.id}`
    const isDragging = draggingId === board.id
    const isOver = dragOverId === board.id && draggingId != null && draggingId !== board.id
    // The All Boards row drops onto board rows too (it lives in the same list).
    const isAllBoardsOver = dragOverId === board.id && draggingAllBoards
    // A record card is being dragged from the board area (pointer-based
    // bridge, separate from this component's native HTML5 drags).
    const recordTarget = recordDrag.recordId != null
    const recordHover = recordDrag.hoverBoardId === board.id
    const count = statsByBoard.get(board.id)?.count ?? 0
    const renaming = renamingBoardId === board.id
    return (
      <div
        key={board.id}
        data-record-drop-board={board.id}
        data-record-drop-name={board.name}
        draggable={draggable && !renaming}
        onDragStart={draggable ? (e) => {
          e.dataTransfer.setData(DND_TYPE, board.id)
          e.dataTransfer.effectAllowed = 'move'
          setDraggingId(board.id)
        } : undefined}
        onDragEnd={draggable ? () => { setDraggingId(null); setDragOverId(null) } : undefined}
        onDragOver={draggable ? (e) => {
          if (!e.dataTransfer.types.includes(DND_TYPE) && !e.dataTransfer.types.includes(ALLBOARDS_DND_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dragOverId !== board.id) setDragOverId(board.id)
        } : undefined}
        onDrop={draggable ? (e) => {
          const isAllBoardsDrop = e.dataTransfer.types.includes(ALLBOARDS_DND_TYPE)
          if (!isAllBoardsDrop && !e.dataTransfer.types.includes(DND_TYPE)) return
          e.preventDefault()
          setDragOverId(null); setDraggingId(null)
          if (isAllBoardsDrop) { placeAllBoards(board.id); return }
          const dragged = e.dataTransfer.getData(DND_TYPE)
          if (dragged) reorder(dragged, board.id)
        } : undefined}
        className={cn(
          'rounded-md',
          draggable && 'cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-40',
          (isOver || isAllBoardsOver) && 'ring-1 ring-inset ring-white/30',
          // Record-drag drop target states (Monday-style cross-board move).
          recordTarget && !recordHover && 'ring-1 ring-inset ring-white/15',
          recordHover && 'bg-white/10 ring-1 ring-inset ring-[#e6c478]',
        )}
      >
        <Link
          href={`/boards/${board.id}`}
          draggable={false}
          title={collapsed ? board.name : undefined}
          onClick={renaming ? (e) => e.preventDefault() : undefined}
          className={cn(
            'relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[14px] transition-colors',
            collapsed ? 'justify-center' : '',
            active
              ? 'bg-sidebar-item-active text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[#e6c478] before:content-[\'\']'
              : 'text-foreground/75 hover:bg-sidebar-item-hover hover:text-foreground',
          )}
        >
          <span
            className="h-2 w-2 flex-shrink-0 rounded-full"
            style={{ background: board.color || 'rgba(255,255,255,0.35)' }}
            aria-hidden
          />
          {!collapsed && (
            <>
              {/* Double-click or right-click / two-finger click to rename (the
                  sidebar stays mounted across the first click's navigation, so
                  the double-click lands on the editor). */}
              <InlineRenameText
                value={board.name}
                className="min-w-0 flex-1 truncate"
                inputClassName="text-[13px]"
                onEditingChange={(ed) => setRenamingBoardId(ed ? board.id : null)}
                onSave={(next) => renameBoard(board.id, next)}
              />
              {recordHover ? (
                <span className="flex-shrink-0 rounded-full bg-[#e6c478] px-1.5 py-0.5 text-[10px] font-bold text-[#0f1d3d]">
                  Move here
                </span>
              ) : (
                <span className="flex-shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/70">
                  {count}
                </span>
              )}
            </>
          )}
        </Link>
      </div>
    )
  }

  if (boards.length === 0 && collapsed) return null

  // Stage flyout for the hovered drop-target board (rendered in a portal so
  // the sidebar's scroll container can't clip it; it measures its own anchor).
  const hoverBoard = recordDrag.hoverBoardId ? boards.find((b) => b.id === recordDrag.hoverBoardId) : undefined
  const stageFlyout = hoverBoard ? (
    <StageFlyout
      board={hoverBoard}
      groups={stagesByBoard?.get(hoverBoard.id)}
      hoverGroupId={recordDrag.hoverGroupId}
    />
  ) : null

  // Collapsed: icons-only flat list (no card, no headers, no reordering).
  // All Boards keeps its place in the rail as a plain icon link.
  if (collapsed) {
    return (
      <div className="space-y-0.5">
        {stageFlyout}
        {boards.map((b) => renderBoard(b, false))}
        <Link
          href="/boards"
          title="All Boards"
          className={cn(
            'flex items-center justify-center rounded-md px-2 py-1.5 transition-colors',
            pathname === '/boards'
              ? 'bg-sidebar-item-active text-foreground'
              : 'text-foreground/75 hover:bg-sidebar-item-hover hover:text-foreground',
          )}
        >
          <Columns3 className="h-4 w-4" />
        </Link>
      </div>
    )
  }

  if (boards.length === 0) {
    return (
      <Link
        href="/boards"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-sidebar-item-hover hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Create first board
      </Link>
    )
  }

  const visGenerate = generateBoards.filter((b) => matches(b.name))
  const visWorkLoans = workLoanBoards.filter((b) => matches(b.name))
  const showConversations = matches('conversations')

  // A section's rows = its board rows with the All Boards row spliced in at
  // its saved index — one list, one spacing rhythm, no floating item. Hidden
  // while the jump filter is active (search targets boards).
  const renderSectionBoards = (list: Board[], section: SectionKey) => {
    const rows = list.map((b) => renderBoard(b, !q))
    if (!q && allBoardsPlacement.section === section) {
      rows.splice(Math.min(allBoardsPlacement.index, rows.length), 0, (
        <AllBoardsRow
          key="all-boards"
          active={pathname === '/boards'}
          count={boards.length}
          dragging={draggingAllBoards}
          onDragState={setDraggingAllBoards}
        />
      ))
    }
    return rows
  }

  // Drag a section HEADER onto the other header to swap the two blocks.
  const headerDnD = (section: SectionKey) => ({
    draggable: !q,
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData(BOARDSECTION_DND_TYPE, section)
      e.dataTransfer.effectAllowed = 'move'
    },
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(BOARDSECTION_DND_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
    },
    onDrop: (e: React.DragEvent<HTMLDivElement>) => {
      if (!e.dataTransfer.types.includes(BOARDSECTION_DND_TYPE)) return
      e.preventDefault()
      const dragged = e.dataTransfer.getData(BOARDSECTION_DND_TYPE)
      if (dragged && dragged !== section) {
        boardSectionsOrder.setSlot(boardSectionsOrder.slot === 'workloans-first' ? 'generate-first' : 'workloans-first')
      }
    },
  })

  // GENERATE — leads & partners. Collapsible; the jump filter reveals
  // matches even in a collapsed group (searching should never hide hits).
  const generateBlock = (visGenerate.length > 0 || showConversations || (!q && allBoardsPlacement.section === 'generate')) && (
    <div key="generate" className="space-y-0.5">
      <div {...headerDnD('generate')} data-record-drop-section="generate" className={cn(!q && 'cursor-grab active:cursor-grabbing')} title="Drag onto the other section header to swap sections">
        <SectionHeader
          icon={<UserPlus className="h-3.5 w-3.5" />}
          chipClass="bg-emerald-400/15 text-emerald-300"
          label={generateLabel.label}
          sublabel="Leads & partners"
          count={sectionCount(generateBoards)}
          addHref="/boards"
          addTitle="Add board"
          isCollapsed={generateSection.collapsed && !q}
          onToggle={generateSection.toggle}
          onRenameLabel={generateLabel.rename}
        />
      </div>
      {(!generateSection.collapsed || q) && (<>
      {showConversations && (
        <Link
          href="/conversations"
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[14px] transition-colors',
            pathname.startsWith('/conversations')
              ? 'bg-sidebar-item-active text-foreground'
              : 'text-foreground/75 hover:bg-sidebar-item-hover hover:text-foreground',
          )}
        >
          <MessageSquare className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Conversations</span>
        </Link>
      )}
      {renderSectionBoards(visGenerate, 'generate')}
      </>)}
    </div>
  )

  // WORK LOANS — active pipeline. Collapsible like Generate.
  const workLoansBlock = (visWorkLoans.length > 0 || (!q && allBoardsPlacement.section === 'workloans')) && (
    <div key="workloans" className="space-y-0.5">
      <div {...headerDnD('workloans')} data-record-drop-section="workloans" className={cn(!q && 'cursor-grab active:cursor-grabbing')} title="Drag onto the other section header to swap sections">
        <SectionHeader
          icon={<FileText className="h-3.5 w-3.5" />}
          chipClass="bg-sky-400/15 text-sky-300"
          label={workLoansLabel.label}
          sublabel="Active pipeline"
          count={sectionCount(workLoanBoards)}
          addHref="/boards"
          addTitle="Add board"
          isCollapsed={workLoansSection.collapsed && !q}
          onToggle={workLoansSection.toggle}
          onRenameLabel={workLoansLabel.rename}
        />
      </div>
      {(!workLoansSection.collapsed || q) && renderSectionBoards(visWorkLoans, 'workloans')}
    </div>
  )

  const boardSections = boardSectionsOrder.slot === 'workloans-first'
    ? [workLoansBlock, generateBlock]
    : [generateBlock, workLoansBlock]

  return (
    <div className="space-y-4">
      {stageFlyout}
      {/* Work Loans Pipeline card — open-stage active loans only (shared
          pipeline rule), so this total always matches the Dashboard. */}
      {!q && (
        <div
          className="rounded-xl border border-[#e6c478]/25 bg-white/[0.04] px-3 py-2.5 shadow-sm"
          title="Loan amounts on active loans in open stages of Work Loans boards — funded/closed stages excluded. Matches the Dashboard's Active pipeline."
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e6c478]">Work Loans Pipeline</p>
          <p className="mt-1 text-2xl font-bold leading-none tabular-nums text-foreground">
            {formatVolume(pipeline.value) || '$0'}
          </p>
          {/* Value distribution across pipeline boards — real shares, not decoration. */}
          {pipeline.value > 0 && (
            <div className="mt-2 flex h-1 gap-0.5 overflow-hidden rounded-full">
              {workLoanBoards.map((b, i) => {
                const v = pipelineStatsByBoard.get(b.id)?.value ?? 0
                if (v <= 0) return null
                return (
                  <div
                    key={b.id}
                    title={`${b.name}: ${formatVolume(v)}`}
                    style={{
                      width: `${Math.max((v / pipeline.value) * 100, 3)}%`,
                      background: b.color || (i % 2 ? '#7ea6d9' : '#e6c478'),
                    }}
                  />
                )
              })}
            </div>
          )}
          <div className="mt-2 flex items-baseline justify-between text-xs text-foreground/70">
            <span className="tabular-nums">{pipeline.count} active {pipeline.count === 1 ? 'loan' : 'loans'}</span>
            {pipeline.avg > 0 && <span className="tabular-nums">Avg {formatVolume(pipeline.avg)}</span>}
          </div>
        </div>
      )}

      {boardSections}
    </div>
  )
}

/** Stage flyout for the hovered cross-board drop target: lists the board's
 *  stages so the drop can land in a SPECIFIC stage (dropping on the board row
 *  itself still means "first stage"). Rendered in a body portal (the sidebar
 *  scroll container would clip it) and it carries the board's drop attributes,
 *  so hovering the flyout keeps the drag target alive. */
function StageFlyout({ board, groups, hoverGroupId }: {
  board: Board
  groups: { id: string; name: string }[] | undefined
  hoverGroupId: string | null
}) {
  // Measure the hovered row (the FIRST element carrying the board's drop
  // attribute — this portal renders after it in the DOM) in an effect, never
  // during render.
  const [anchor, setAnchor] = useState<{ right: number; top: number } | null>(null)
  useEffect(() => {
    const el = document.querySelector(`[data-record-drop-board="${board.id}"]`)
    const r = el?.getBoundingClientRect()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnchor(r ? { right: r.right, top: r.top } : null)
  }, [board.id])
  if (!anchor) return null
  const top = Math.max(8, Math.min(anchor.top, window.innerHeight - 320))
  return createPortal(
    <div
      data-record-drop-board={board.id}
      data-record-drop-name={board.name}
      className="fixed z-[100] w-56 rounded-xl border border-white/15 bg-jubo-navy p-1.5 text-white shadow-xl"
      style={{ left: anchor.right + 6, top }}
    >
      <p className="px-2 pb-1 pt-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">
        Move to stage · {board.name}
      </p>
      {groups === undefined ? (
        <p className="px-2 py-1.5 text-xs text-white/55">Loading stages…</p>
      ) : groups.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-white/55">No stages on this board</p>
      ) : (
        <div className="max-h-64 overflow-y-auto">
          {groups.map((g) => (
            <div
              key={g.id}
              data-record-drop-group={g.id}
              data-record-drop-group-name={g.name}
              className={cn(
                'truncate rounded-md px-2 py-1.5 text-xs',
                hoverGroupId === g.id ? 'bg-[#e6c478] font-semibold text-[#0f1d3d]' : 'text-white/85',
              )}
            >
              {g.name}
            </div>
          ))}
        </div>
      )}
      <p className="px-2 pb-0.5 pt-1 text-[9px] text-white/35">Drop on the board name = first stage</p>
    </div>,
    document.body,
  )
}

/** The "All Boards" nav row — a static route link (system item, not a board
 *  record) rendered as a NORMAL list row: identical height, padding, text
 *  size, hover/active treatment, and count pill as the board rows around it.
 *  Drag it onto any board row OR any shell nav row/group to move it there;
 *  placement persists per-browser via useSidebarSlot. Exported so the shell
 *  can render it inside its own nav groups (count is optional there). */
export function AllBoardsRow({ active, count, dragging, onDragState }: {
  active: boolean
  count?: number
  dragging: boolean
  onDragState: (d: boolean) => void
}) {
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(ALLBOARDS_DND_TYPE, '1')
        e.dataTransfer.effectAllowed = 'move'
        onDragState(true)
      }}
      onDragEnd={() => onDragState(false)}
      className={cn('cursor-grab rounded-md active:cursor-grabbing', dragging && 'opacity-40')}
      title="Drag onto a board to move All Boards"
    >
      <Link
        href="/boards"
        draggable={false}
        className={cn(
          'relative flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[14px] transition-colors',
          active
            ? 'bg-sidebar-item-active text-foreground before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-[#e6c478] before:content-[\'\']'
            : 'text-foreground/75 hover:bg-sidebar-item-hover hover:text-foreground',
        )}
      >
        <Columns3 className="h-4 w-4 flex-shrink-0" />
        <span className="min-w-0 flex-1 truncate">All Boards</span>
        {typeof count === 'number' && (
          <span className="flex-shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/70">
            {count}
          </span>
        )}
      </Link>
    </div>
  )
}

/** Monday-style collapsible group header: chevron + colored icon chip +
 *  uppercase label with a plain-language subline + real rolled-up count, and a
 *  quick-add action. The label area is one toggle button; the quick-add is a
 *  SIBLING element, so adding never collapses the group. Count and quick-add
 *  stay visible while collapsed. */
export function SectionHeader({
  icon, chipClass, label, sublabel, count, addHref, addTitle, onAdd, isCollapsed, onToggle, onRenameLabel,
}: {
  icon: React.ReactNode
  chipClass: string
  label: string
  sublabel: string
  count?: number
  addHref?: string
  addTitle?: string
  onAdd?: () => void
  /** When provided (with onToggle), the header toggles its group. */
  isCollapsed?: boolean
  onToggle?: () => void
  /** When provided, double-clicking the label edits it inline (Enter saves,
   *  Escape cancels, empty cancels). Persistence is the caller's concern. */
  onRenameLabel?: (next: string) => void
}) {
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState('')
  const beginLabelEdit = (e: React.SyntheticEvent) => {
    if (!onRenameLabel) return
    e.preventDefault()
    e.stopPropagation() // never toggles collapse or starts navigation
    setLabelDraft(label)
    setEditingLabel(true)
  }
  const commitLabel = () => {
    setEditingLabel(false)
    const next = labelDraft.trim()
    if (next && next !== label) onRenameLabel?.(next) // empty/unchanged → cancel
  }

  // Edit mode replaces the toggle button with a plain row + input so typing
  // can never collapse the group or trigger navigation.
  if (editingLabel) {
    return (
      <div className="flex items-center gap-1 px-1 pb-1 pt-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">
          <span className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md', chipClass)}>
            {icon}
          </span>
          <input
            autoFocus
            value={labelDraft}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commitLabel() }
              if (e.key === 'Escape') { e.preventDefault(); setEditingLabel(false) }
            }}
            onBlur={commitLabel}
            aria-label="Rename section"
            className="w-full min-w-0 rounded border border-white/30 bg-white/10 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.12em] text-foreground focus:outline-none focus:ring-1 focus:ring-white/40"
          />
        </div>
      </div>
    )
  }

  const labelBlock = (
    <>
      {onToggle && (
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 flex-shrink-0 text-foreground/40 transition-transform duration-150',
            isCollapsed && '-rotate-90',
          )}
        />
      )}
      <span className={cn('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md', chipClass)}>
        {icon}
      </span>
      <div className="min-w-0 flex-1 text-left leading-tight">
        <p
          className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/90"
          title={onRenameLabel ? 'Double-click to rename' : undefined}
          onDoubleClick={onRenameLabel ? beginLabelEdit : undefined}
        >
          {label}
        </p>
        <p className="truncate text-[10px] text-foreground/50">{sublabel}</p>
      </div>
      {typeof count === 'number' && count > 0 && (
        <span className="flex-shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/70">
          {count}
        </span>
      )}
    </>
  )

  return (
    <div className="flex items-center gap-1 px-1 pb-1 pt-1.5">
      {onToggle ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!isCollapsed}
          title={isCollapsed ? `Expand ${label}` : `Collapse ${label}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-0.5 transition-colors hover:bg-sidebar-item-hover"
        >
          {labelBlock}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1 py-0.5">{labelBlock}</div>
      )}
      {onAdd ? (
        <button
          onClick={onAdd}
          title={addTitle}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-sidebar-item-hover hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      ) : addHref ? (
        <Link
          href={addHref}
          title={addTitle}
          className="flex-shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-sidebar-item-hover hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  )
}
