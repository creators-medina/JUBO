'use client'

// ─────────────────────────────────────────────────────────────────────────
// All Boards — the board command center. Header + summary cards (total
// boards · active records · pipeline total · recently updated), a client-side
// search, and the boards grouped into the same Work Loans / Generate sections
// the sidebar derives. Every number comes from the read-only stats the server
// page computed (shared loan-amount resolver — never a second money source);
// missing values render "—", never invented.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useState } from 'react'
import { Plus, Columns3, Search, Users, DollarSign, Clock } from 'lucide-react'
import { PageHeader } from '@/components/primitives/PageHeader'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Button } from '@/components/ui/button'
import { formatVolume } from './BoardStageSummary'
import { formatRelativeTime } from './KanbanCardFace'
import { boardSectionKey } from './DynamicBoardsSidebarSection'
import { useSidebarSectionOverrides } from '@/hooks/useSidebarSectionOverrides'
import { CreateBoardModal } from './CreateBoardModal'
import { BoardCard } from './BoardCard'

export type BoardStats = { count: number; value: number; lastUpdated: string | null }

interface Props {
  boards: any[]
  organizationId: string
  /** Per-board rollups from the server page (read-only; may be empty). */
  stats?: Record<string, BoardStats>
}

export function BoardsClient({ boards, organizationId, stats = {} }: Props) {
  const [showCreate, setShowCreate] = useState(false)
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const visible = useMemo(
    () => (q
      ? boards.filter((b) =>
          `${b.name ?? ''} ${b.description ?? ''} ${b.board_type ?? ''}`.toLowerCase().includes(q))
      : boards),
    [boards, q],
  )
  // Same grouping as the sidebar — including any per-browser drag-between-
  // groups overrides — so the two views never disagree.
  const { overrides } = useSidebarSectionOverrides()
  const workLoans = visible.filter((b) => boardSectionKey(b, overrides) === 'workloans')
  const generate = visible.filter((b) => boardSectionKey(b, overrides) === 'generate')

  // Summary rollups — real stats only; totals omit what isn't loaded.
  const totalRecords = boards.reduce((s, b) => s + (stats[b.id]?.count ?? 0), 0)
  const totalValue = boards.reduce((s, b) => s + (stats[b.id]?.value ?? 0), 0)
  const hasStats = Object.keys(stats).length > 0
  const recent = boards.reduce<{ name: string; at: string } | null>((best, b) => {
    const at = stats[b.id]?.lastUpdated
    if (!at) return best
    return !best || at > best.at ? { name: b.name, at } : best
  }, null)

  return (
    <>
      <PageHeader title="All Boards" description="View and manage your CRM workspaces, pipelines, and dashboards.">
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5 mr-1.5" />
          New Board
        </Button>
      </PageHeader>

      {boards.length === 0 ? (
        <EmptyState
          icon={Columns3}
          title="No boards found yet"
          description="Create your first board to start organizing your work."
        >
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Create board
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {/* Summary cards — real data only ("—" when a rollup isn't loaded). */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard icon={<Columns3 className="h-4 w-4" />} iconClass="bg-jubo-navy/10 text-jubo-navy" value={String(boards.length)} label={boards.length === 1 ? 'Board' : 'Boards'} />
            <SummaryCard icon={<Users className="h-4 w-4" />} iconClass="bg-jubo-green-soft text-jubo-green" value={hasStats ? totalRecords.toLocaleString() : '—'} label="Active records" />
            <SummaryCard icon={<DollarSign className="h-4 w-4" />} iconClass="bg-jubo-gold-soft text-jubo-gold" value={hasStats ? (formatVolume(totalValue) || '$0') : '—'} label="Pipeline loan amount" />
            <SummaryCard icon={<Clock className="h-4 w-4" />} iconClass="bg-jubo-red/10 text-jubo-red" value={recent ? recent.name : '—'} label={recent ? `Updated ${formatRelativeTime(recent.at)}` : 'Recently updated'} valueSmall />
          </div>

          {/* Search — client-side over name / description / type. */}
          <div className="relative max-w-sm">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search boards…"
              className="w-full rounded-lg border border-border bg-surface-1 py-2 pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-jubo-navy"
            />
          </div>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-10 text-center text-sm text-muted-foreground">
              No boards match “{query.trim()}”.
            </p>
          ) : (
            <>
              {workLoans.length > 0 && (
                <BoardSection title="Work Loans" sublabel="Active pipeline" boards={workLoans} stats={stats} />
              )}
              {generate.length > 0 && (
                <BoardSection title="Generate" sublabel="Leads & partners" boards={generate} stats={stats} />
              )}
            </>
          )}
        </div>
      )}

      <CreateBoardModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        organizationId={organizationId}
      />
    </>
  )
}

function BoardSection({ title, sublabel, boards, stats }: { title: string; sublabel: string; boards: Props['boards']; stats: Record<string, BoardStats> }) {
  return (
    <section>
      <div className="mb-2.5 flex items-center gap-3">
        <h2 className="whitespace-nowrap text-[11px] font-bold uppercase tracking-[0.12em] text-jubo-gold">{title}</h2>
        <span className="whitespace-nowrap text-2xs text-muted-foreground">{sublabel} · {boards.length}</span>
        <div className="h-px flex-1 bg-border/70" />
      </div>
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {boards.map((board) => (
          <BoardCard key={board.id} board={board} stats={stats[board.id]} />
        ))}
      </div>
    </section>
  )
}

/** One summary stat: icon chip + value over a small label (header-card style). */
function SummaryCard({ icon, iconClass, value, label, valueSmall }: {
  icon: React.ReactNode; iconClass: string; value: string; label: string; valueSmall?: boolean
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 shadow-sm">
      <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}>{icon}</span>
      <div className="min-w-0 leading-tight">
        <p className={valueSmall ? 'truncate text-sm font-bold text-foreground' : 'text-lg font-bold tabular-nums text-foreground'}>{value}</p>
        <p className="truncate text-[10px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
