'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Columns3, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/providers/OrganizationProvider'
import { reorderBoards } from '@/features/boards/actions'
import { cn } from '@/lib/utils'

interface Board {
  id: string
  name: string
  board_type: string
  color: string | null
  position?: number
}

const BOARD_TYPE_ACCENT: Record<string, string> = {
  pipeline: 'text-violet-400',
  crm: 'text-blue-400',
  operations: 'text-amber-400',
  recruiting: 'text-emerald-400',
  custom: 'text-muted-foreground',
}

// Presentation-only grouping: boards are matched into visual groups by name.
// This does NOT change board names, ids, routes, or any stored data.
const CLIENT_JOURNEY_MATCHERS = [
  'phase 1',
  'phase 2',
  'phase 2-3',
  'phase 3',
  'phase 4',
  'lead capture',
  'post closing',
  'in process',
]

const RELATIONSHIPS_MATCHERS = ['realtor', 'partner', 'referral', 'past client']

type BoardGroupKey = 'clientJourney' | 'relationships' | 'other'

function groupKeyForBoard(board: Board): BoardGroupKey {
  const name = board.name.toLowerCase()
  if (CLIENT_JOURNEY_MATCHERS.some(m => name.includes(m))) return 'clientJourney'
  if (RELATIONSHIPS_MATCHERS.some(m => name.includes(m))) return 'relationships'
  return 'other'
}

const GROUP_ORDER: { key: BoardGroupKey; label: string }[] = [
  { key: 'clientJourney', label: 'Client Journey' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'other', label: 'Other Boards' },
]

// Drag payload key — distinct so it can't collide with other native DnD in the app.
const DND_TYPE = 'text/jubo-board-id'

export function DynamicBoardsSidebarSection({ collapsed }: { collapsed: boolean }) {
  const { currentOrganization } = useOrganization()
  const pathname = usePathname()
  const [boards, setBoards] = useState<Board[]>([])
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => {
    if (!currentOrganization) return
    const supabase = createClient()
    let cancelled = false
    ;(async () => {
      // Prefer the persisted sidebar order (boards.position, added in phase5l).
      // Fall back to created_at if the column isn't present yet (pre-migration),
      // so the sidebar never breaks on a deploy that precedes the migration.
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
    })()
    return () => { cancelled = true }
  }, [currentOrganization])

  if (boards.length === 0 && collapsed) return null

  const grouped: Record<BoardGroupKey, Board[]> = {
    clientJourney: [],
    relationships: [],
    other: [],
  }
  for (const board of boards) {
    grouped[groupKeyForBoard(board)].push(board)
  }

  // Reorder within the flat list (which preserves each group's relative order).
  // Only allowed WITHIN the same visual group — groups are name-derived, so a
  // cross-group move would need a rename, which we never do here.
  const reorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const from = boards.findIndex(b => b.id === draggedId)
    const toIdx = boards.findIndex(b => b.id === targetId)
    if (from < 0 || toIdx < 0) return
    if (groupKeyForBoard(boards[from]) !== groupKeyForBoard(boards[toIdx])) return
    const prev = boards
    const next = [...boards]
    const [moved] = next.splice(from, 1)
    const insertAt = next.findIndex(b => b.id === targetId)
    next.splice(insertAt, 0, moved)
    setBoards(next) // optimistic
    reorderBoards(next.map(b => b.id)).catch(() => setBoards(prev)) // rollback on failure
  }

  const renderBoard = (board: Board, draggable: boolean) => {
    const active = pathname === `/boards/${board.id}`
    const isDragging = draggingId === board.id
    const isOver = dragOverId === board.id && draggingId !== board.id
        && draggingId != null && groupKeyForBoard(board) === groupKeyForBoard(boards.find(b => b.id === draggingId) ?? board)
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
          isOver && 'ring-1 ring-inset ring-jubo-navy/40',
        )}
      >
        <Link
          href={`/boards/${board.id}`}
          draggable={false}
          title={collapsed ? board.name : undefined}
          className={cn(
            'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-[15px] transition-colors',
            collapsed ? 'justify-center' : '',
            active
              ? 'bg-sidebar-item-active text-foreground'
              : 'text-foreground/80 hover:bg-sidebar-item-hover hover:text-foreground'
          )}
        >
          <Columns3 className={cn('w-4 h-4 flex-shrink-0', BOARD_TYPE_ACCENT[board.board_type] ?? 'text-muted-foreground')} />
          {!collapsed && <span className="truncate text-[15px]">{board.name}</span>}
        </Link>
      </div>
    )
  }

  if (boards.length === 0) {
    if (collapsed) return null
    return (
      <div className="space-y-0.5">
        <Link
          href="/boards"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-item-hover transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create first board
        </Link>
      </div>
    )
  }

  // Collapsed: render icons only, no group headers, no reordering.
  if (collapsed) {
    return <div className="space-y-0.5">{boards.map(b => renderBoard(b, false))}</div>
  }

  return (
    <div className="space-y-3">
      {GROUP_ORDER.map(group => {
        const groupBoards = grouped[group.key]
        if (groupBoards.length === 0) return null
        return (
          <div key={group.key} className="space-y-0.5">
            <p className="px-2 py-1 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
              {group.label}
            </p>
            {/* Drag to reorder within this group; cross-group drops are ignored. */}
            {groupBoards.map(b => renderBoard(b, true))}
          </div>
        )
      })}
    </div>
  )
}
