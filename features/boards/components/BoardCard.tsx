'use client'

import Link from 'next/link'
import { Columns3 } from 'lucide-react'
import { cn } from '@/lib/utils'

const BOARD_TYPE_COLORS: Record<string, string> = {
  crm: 'text-blue-400',
  pipeline: 'text-violet-400',
  operations: 'text-amber-400',
  recruiting: 'text-emerald-400',
  custom: 'text-muted-foreground',
}

export function BoardCard({ board }: { board: any }) {
  return (
    <Link
      href={`/boards/${board.id}`}
      className="group flex flex-col gap-3 p-4 rounded-lg bg-card border border-border hover:bg-surface-2 hover:border-border/80 transition-colors"
    >
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center flex-shrink-0">
          <Columns3 className={cn('w-4 h-4', BOARD_TYPE_COLORS[board.board_type] ?? 'text-muted-foreground')} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{board.name}</p>
          <p className="text-xs text-muted-foreground capitalize">{board.board_type}</p>
        </div>
      </div>
      {board.description && (
        <p className="text-xs text-muted-foreground line-clamp-2">{board.description}</p>
      )}
      <p className="text-xs text-muted-foreground mt-auto">
        {new Date(board.created_at).toLocaleDateString()}
      </p>
    </Link>
  )
}
