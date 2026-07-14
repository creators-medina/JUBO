'use client'

// Board card for the All Boards command center — name + type badge, optional
// description, and a real stats row (records · loan total · last updated).
// Stats come from the server rollup; anything missing renders "—"/collapses.

import Link from 'next/link'
import { Columns3, Users, DollarSign, Clock, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatVolume } from './BoardStageSummary'
import { formatRelativeTime } from './KanbanCardFace'
import type { BoardStats } from './BoardsClient'

const BOARD_TYPE_COLORS: Record<string, string> = {
  crm: 'text-blue-400',
  pipeline: 'text-violet-400',
  operations: 'text-amber-400',
  recruiting: 'text-emerald-400',
  custom: 'text-muted-foreground',
}

export function BoardCard({ board, stats }: { board: any; stats?: BoardStats }) {
  return (
    <Link
      href={`/boards/${board.id}`}
      className="group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-4 shadow-sm transition-all hover:border-jubo-border-strong hover:shadow-md"
    >
      <div className="flex items-center gap-2.5">
        <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-surface-2">
          <Columns3 className={cn('h-4 w-4', BOARD_TYPE_COLORS[board.board_type] ?? 'text-muted-foreground')} />
          {board.color && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-card" style={{ backgroundColor: board.color }} aria-hidden />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground" title={board.name}>{board.name}</p>
          <span className="inline-flex items-center rounded-full border border-border bg-surface-2 px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
            {board.board_type}
          </span>
        </div>
        <ArrowUpRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground" aria-hidden />
      </div>

      {board.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground" title={board.description}>{board.description}</p>
      )}

      {/* Real stats row — records · loan total · last activity ("—" when unknown). */}
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/70 pt-2 text-2xs text-muted-foreground">
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Users className="h-3 w-3" /> {stats ? stats.count.toLocaleString() : '—'}
        </span>
        <span className="inline-flex items-center gap-1 tabular-nums" title="Total base loan amount on this board">
          <DollarSign className="h-3 w-3" /> {stats ? (formatVolume(stats.value) || '$0') : '—'}
        </span>
        <span className="ml-auto inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {stats?.lastUpdated ? formatRelativeTime(stats.lastUpdated) : '—'}
        </span>
      </div>
    </Link>
  )
}
