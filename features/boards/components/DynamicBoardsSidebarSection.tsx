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

  // Reorder anywhere in the single flat list. The sidebar is now one ordered list
  // driven purely by boards.position (no name-derived sections), so a board can be
  // dropped above OR below any other board — including across what used to be
  // separate visual sections. Names/types/routes are never touched.
  const reorder = (draggedId: string, targetId: string) => {
    if (draggedId === targetId) return
    const from = boards.findIndex(b => b.id === draggedId)
    const to = boards.findIndex(b => b.id === targetId)
    if (from < 0 || to < 0) return
    const prev = boards
    const next = boards.filter(b => b.id !== draggedId)
    // Dropping downward lands the board just AFTER the target; dropping upward just
    // BEFORE it — so every slot (including the very top and bottom) is reachable.
    const targetIdx = next.findIndex(b => b.id === targetId)
    const insertAt = from < to ? targetIdx + 1 : targetIdx
    next.splice(insertAt, 0, boards[from])
    setBoards(next) // optimistic
    reorderBoards(next.map(b => b.id)).catch(() => setBoards(prev)) // rollback on failure
  }

  const renderBoard = (board: Board, draggable: boolean) => {
    const active = pathname === `/boards/${board.id}`
    const isDragging = draggingId === board.id
    const isOver = dragOverId === board.id && draggingId != null && draggingId !== board.id
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

  // Collapsed: render icons only, no header, no reordering.
  if (collapsed) {
    return <div className="space-y-0.5">{boards.map(b => renderBoard(b, false))}</div>
  }

  // Expanded: one unified, fully drag-reorderable list ordered by position.
  return (
    <div className="space-y-0.5">
      <p className="px-2 py-1 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
        Boards
      </p>
      {boards.map(b => renderBoard(b, true))}
    </div>
  )
}
