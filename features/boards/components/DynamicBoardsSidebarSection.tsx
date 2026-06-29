'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Columns3, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useOrganization } from '@/providers/OrganizationProvider'
import { cn } from '@/lib/utils'

interface Board {
  id: string
  name: string
  board_type: string
  color: string | null
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

export function DynamicBoardsSidebarSection({ collapsed }: { collapsed: boolean }) {
  const { currentOrganization } = useOrganization()
  const pathname = usePathname()
  const [boards, setBoards] = useState<Board[]>([])

  useEffect(() => {
    if (!currentOrganization) return
    const supabase = createClient()
    supabase
      .from('boards')
      .select('id, name, board_type, color')
      .eq('organization_id', currentOrganization.id)
      .eq('is_archived', false)
      .order('created_at', { ascending: true })
      .then(({ data }) => setBoards(data ?? []))
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

  const renderBoard = (board: Board) => {
    const active = pathname === `/boards/${board.id}`
    return (
      <Link
        key={board.id}
        href={`/boards/${board.id}`}
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

  // Collapsed: render icons only, no group headers.
  if (collapsed) {
    return <div className="space-y-0.5">{boards.map(renderBoard)}</div>
  }

  return (
    <div className="space-y-3">
      {GROUP_ORDER.map(group => {
        const groupBoards = grouped[group.key]
        if (groupBoards.length === 0) return null
        return (
          <div key={group.key} className="space-y-0.5">
            <p className="px-2 py-1 text-xs font-semibold text-jubo-gold-soft/80 uppercase tracking-wider">
              {group.label}
            </p>
            {groupBoards.map(renderBoard)}
          </div>
        )
      })}
    </div>
  )
}
