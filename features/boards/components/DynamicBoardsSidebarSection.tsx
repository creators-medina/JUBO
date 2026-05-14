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

  return (
    <div className="space-y-0.5">
      {!collapsed && (
        <div className="flex items-center justify-between px-2 py-1">
          <p className="text-2xs font-medium text-muted-foreground uppercase tracking-wider">Boards</p>
          <Link
            href="/boards"
            className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-item-hover transition-colors"
            title="All boards"
          >
            <Plus className="w-3 h-3" />
          </Link>
        </div>
      )}
      {boards.map(board => {
        const active = pathname === `/boards/${board.id}`
        return (
          <Link
            key={board.id}
            href={`/boards/${board.id}`}
            title={collapsed ? board.name : undefined}
            className={cn(
              'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-sm transition-colors',
              collapsed ? 'justify-center' : '',
              active
                ? 'bg-sidebar-item-active text-foreground'
                : 'text-muted-foreground hover:bg-sidebar-item-hover hover:text-foreground'
            )}
          >
            <Columns3 className={cn('w-4 h-4 flex-shrink-0', BOARD_TYPE_ACCENT[board.board_type] ?? 'text-muted-foreground')} />
            {!collapsed && <span className="truncate text-sm">{board.name}</span>}
          </Link>
        )
      })}
      {!collapsed && boards.length === 0 && (
        <Link
          href="/boards"
          className="flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-sidebar-item-hover transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create first board
        </Link>
      )}
    </div>
  )
}
