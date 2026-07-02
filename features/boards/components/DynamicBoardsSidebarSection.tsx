'use client'

// ─────────────────────────────────────────────────────────────────────────
// DynamicBoardsSidebarSection — the workflow-first board nav (Board Redesign
// reference): a "Work Loans Pipeline" summary card, then two segmented
// sections built around what a loan officer does all day:
//   • GENERATE   — leads & partners (Conversations + every non-pipeline board)
//   • WORK LOANS — active pipeline (boards with board_type 'pipeline', plus
//                  journey-named boards), with real counts and dollar totals.
//
// All numbers are REAL: one org-scoped, RLS-protected, read-only query over
// records (board_id, value, parent_record_id) drives the per-board count
// pills, the rolled-up section counts, and the pipeline card (sum / count /
// avg of records.value — the same money source the board header uses).
// Nothing is written except the existing boards.position reorder.
//
// Sections are PRESENTATION-ONLY (derived from stored board_type + name
// fallback; never persisted). Drag-to-reorder therefore works WITHIN a
// section — the reorder is computed on the full flat list so the global
// boards.position order is preserved — and cross-section drops are ignored
// rather than faked (honest cross-section placement needs a stored category;
// proposed as a separate backend phase).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { ChevronDown, Columns3, MessageSquare, Plus, UserPlus, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/providers/OrganizationProvider'
import { reorderBoards } from '@/features/boards/actions'
import { useSidebarSectionCollapsed } from '@/hooks/useSidebarSectionCollapsed'
import { formatVolume } from './BoardStageSummary'
import { cn } from '@/lib/utils'

interface Board {
  id: string
  name: string
  board_type: string
  color: string | null
  position?: number
}

type RecordRow = { board_id: string | null; value: number | null; parent_record_id: string | null }

// Work Loans = the active loan pipeline. Primary signal is the STORED
// board_type ('pipeline'); the name matchers only catch journey boards that
// were created under another type. Everything else reads as Generate.
const WORK_LOAN_NAME_MATCHERS = [
  'phase', 'lead capture', 'post closing', 'post-closing', 'in process', 'underwrit', 'initial consult',
]

function isWorkLoansBoard(b: Board): boolean {
  if (b.board_type === 'pipeline') return true
  const n = b.name.toLowerCase()
  return WORK_LOAN_NAME_MATCHERS.some((m) => n.includes(m))
}

// Drag payload key — distinct so it can't collide with other native DnD in the app.
const DND_TYPE = 'text/jubo-board-id'

export function DynamicBoardsSidebarSection({ collapsed, filter = '' }: { collapsed: boolean; filter?: string }) {
  const { currentOrganization } = useOrganization()
  const pathname = usePathname()
  const [boards, setBoards] = useState<Board[]>([])
  const [recordRows, setRecordRows] = useState<RecordRow[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // Monday-style collapsible groups (localStorage-persisted, default open).
  const generateSection = useSidebarSectionCollapsed('generate')
  const workLoansSection = useSidebarSectionCollapsed('workloans')

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

      // READ-ONLY aggregate source: three tiny columns per active record,
      // org-scoped by RLS. Drives counts + pipeline value; never written.
      const recs = await supabase
        .from('records')
        .select('board_id, value, parent_record_id')
        .eq('organization_id', currentOrganization.id)
        .eq('is_archived', false)
      if (!cancelled) setRecordRows(((recs.data ?? []) as RecordRow[]))
    })()
    return () => { cancelled = true }
  }, [currentOrganization])

  // Per-board rollups from the records read (top-level records only).
  const statsByBoard = useMemo(() => {
    const m = new Map<string, { count: number; value: number; valued: number }>()
    for (const r of recordRows) {
      if (!r.board_id || r.parent_record_id) continue
      const s = m.get(r.board_id) ?? { count: 0, value: 0, valued: 0 }
      s.count += 1
      const v = Number(r.value) || 0
      if (v > 0) { s.value += v; s.valued += 1 }
      m.set(r.board_id, s)
    }
    return m
  }, [recordRows])

  const generateBoards = useMemo(() => boards.filter((b) => !isWorkLoansBoard(b)), [boards])
  const workLoanBoards = useMemo(() => boards.filter(isWorkLoansBoard), [boards])

  // Keep the active board discoverable: force its section open when the route
  // points inside it (runs on route/board changes only — a manual collapse on
  // the same route is respected because toggle/forceOpen are stable callbacks).
  const forceOpenGenerate = generateSection.forceOpen
  const forceOpenWorkLoans = workLoansSection.forceOpen
  useEffect(() => {
    const activeBoard = boards.find((b) => pathname === `/boards/${b.id}`)
    if (!activeBoard) return
    if (isWorkLoansBoard(activeBoard)) forceOpenWorkLoans()
    else forceOpenGenerate()
  }, [pathname, boards, forceOpenGenerate, forceOpenWorkLoans])

  const q = filter.trim().toLowerCase()
  const matches = (name: string) => !q || name.toLowerCase().includes(q)

  const sectionCount = (list: Board[]) => list.reduce((s, b) => s + (statsByBoard.get(b.id)?.count ?? 0), 0)
  const pipeline = useMemo(() => {
    let value = 0, count = 0, valued = 0
    for (const b of workLoanBoards) {
      const s = statsByBoard.get(b.id)
      if (!s) continue
      value += s.value; count += s.count; valued += s.valued
    }
    return { value, count, avg: valued > 0 ? value / valued : 0 }
  }, [workLoanBoards, statsByBoard])

  // Reorder within the flat list (preserves global boards.position semantics).
  // Cross-section drops are ignored: sections are derived, not stored, so a
  // cross-section move can't persist honestly without a backend category.
  const reorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const from = boards.findIndex((b) => b.id === draggedId)
    const to = boards.findIndex((b) => b.id === targetId)
    if (from < 0 || to < 0) return
    if (isWorkLoansBoard(boards[from]) !== isWorkLoansBoard(boards[to])) return
    const prev = boards
    const next = boards.filter((b) => b.id !== draggedId)
    const targetIdx = next.findIndex((b) => b.id === targetId)
    const insertAt = from < to ? targetIdx + 1 : targetIdx
    next.splice(insertAt, 0, boards[from])
    setBoards(next) // optimistic
    reorderBoards(next.map((b) => b.id)).catch(() => setBoards(prev)) // rollback on failure
  }

  const renderBoard = (board: Board, draggable: boolean) => {
    const active = pathname === `/boards/${board.id}`
    const isDragging = draggingId === board.id
    const isOver = dragOverId === board.id && draggingId != null && draggingId !== board.id
      && isWorkLoansBoard(board) === isWorkLoansBoard(boards.find((b) => b.id === draggingId) ?? board)
    const count = statsByBoard.get(board.id)?.count ?? 0
    return (
      <div
        key={board.id}
        draggable={draggable}
        onDragStart={draggable ? (e) => {
          e.dataTransfer.setData(DND_TYPE, board.id)
          e.dataTransfer.effectAllowed = 'move'
          setDraggingId(board.id)
        } : undefined}
        onDragEnd={draggable ? () => { setDraggingId(null); setDragOverId(null) } : undefined}
        onDragOver={draggable ? (e) => {
          if (!e.dataTransfer.types.includes(DND_TYPE)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (dragOverId !== board.id) setDragOverId(board.id)
        } : undefined}
        onDrop={draggable ? (e) => {
          if (!e.dataTransfer.types.includes(DND_TYPE)) return
          e.preventDefault()
          const dragged = e.dataTransfer.getData(DND_TYPE)
          setDragOverId(null); setDraggingId(null)
          if (dragged) reorder(dragged, board.id)
        } : undefined}
        className={cn(
          'rounded-md',
          draggable && 'cursor-grab active:cursor-grabbing',
          isDragging && 'opacity-40',
          isOver && 'ring-1 ring-inset ring-white/30',
        )}
      >
        <Link
          href={`/boards/${board.id}`}
          draggable={false}
          title={collapsed ? board.name : undefined}
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
              <span className="min-w-0 flex-1 truncate">{board.name}</span>
              <span className="flex-shrink-0 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-foreground/70">
                {count}
              </span>
            </>
          )}
        </Link>
      </div>
    )
  }

  if (boards.length === 0 && collapsed) return null

  // Collapsed: icons-only flat list (no card, no headers, no reordering).
  if (collapsed) {
    return <div className="space-y-0.5">{boards.map((b) => renderBoard(b, false))}</div>
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

  return (
    <div className="space-y-4">
      {/* Work Loans Pipeline card — real totals from records.value (read-only). */}
      {!q && (
        <div className="rounded-xl border border-[#e6c478]/25 bg-white/[0.04] px-3 py-2.5 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#e6c478]">Work Loans Pipeline</p>
          <p className="mt-1 text-2xl font-bold leading-none tabular-nums text-foreground">
            {formatVolume(pipeline.value) || '$0'}
          </p>
          {/* Value distribution across pipeline boards — real shares, not decoration. */}
          {pipeline.value > 0 && (
            <div className="mt-2 flex h-1 gap-0.5 overflow-hidden rounded-full">
              {workLoanBoards.map((b, i) => {
                const v = statsByBoard.get(b.id)?.value ?? 0
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

      {/* GENERATE — leads & partners. Collapsible; the jump filter reveals
          matches even in a collapsed group (searching should never hide hits). */}
      {(visGenerate.length > 0 || showConversations) && (
        <div className="space-y-0.5">
          <SectionHeader
            icon={<UserPlus className="h-3.5 w-3.5" />}
            chipClass="bg-emerald-400/15 text-emerald-300"
            label="Generate"
            sublabel="Leads & partners"
            count={sectionCount(generateBoards)}
            addHref="/boards"
            addTitle="Add board"
            isCollapsed={generateSection.collapsed && !q}
            onToggle={generateSection.toggle}
          />
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
          {visGenerate.map((b) => renderBoard(b, !q))}
          </>)}
        </div>
      )}

      {/* WORK LOANS — active pipeline. Collapsible like Generate. */}
      {visWorkLoans.length > 0 && (
        <div className="space-y-0.5">
          <SectionHeader
            icon={<FileText className="h-3.5 w-3.5" />}
            chipClass="bg-sky-400/15 text-sky-300"
            label="Work Loans"
            sublabel="Active pipeline"
            count={sectionCount(workLoanBoards)}
            addHref="/boards"
            addTitle="Add board"
            isCollapsed={workLoansSection.collapsed && !q}
            onToggle={workLoansSection.toggle}
          />
          {(!workLoansSection.collapsed || q) && visWorkLoans.map((b) => renderBoard(b, !q))}
        </div>
      )}

      {/* All Boards — kept available (route preserved), de-emphasized. */}
      {!q && (
        <Link
          href="/boards"
          className={cn(
            'flex items-center gap-2 rounded-md px-2 py-1 text-2xs transition-colors',
            pathname === '/boards'
              ? 'text-foreground'
              : 'text-muted-foreground hover:bg-sidebar-item-hover hover:text-foreground',
          )}
        >
          <Columns3 className="h-3 w-3 flex-shrink-0" />
          All Boards
        </Link>
      )}
    </div>
  )
}

/** Monday-style collapsible group header: chevron + colored icon chip +
 *  uppercase label with a plain-language subline + real rolled-up count, and a
 *  quick-add action. The label area is one toggle button; the quick-add is a
 *  SIBLING element, so adding never collapses the group. Count and quick-add
 *  stay visible while collapsed. */
export function SectionHeader({
  icon, chipClass, label, sublabel, count, addHref, addTitle, onAdd, isCollapsed, onToggle,
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
}) {
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
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.12em] text-foreground/90">{label}</p>
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
