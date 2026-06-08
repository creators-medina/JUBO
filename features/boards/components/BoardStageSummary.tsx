'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardStageSummary (Phase 34D-B) — the pipeline stage strip at the top of a
// board. One chip per group/stage: order number, name, record count, and
// volume (sum of records' value) when available. The emphasized stage (highest
// volume, else highest count) gets the 34D-A premium frame. Clicking a chip
// scrolls to its group. Presentational only — no engine/schema changes.
// ─────────────────────────────────────────────────────────────────────────

import { Fragment } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

// Restrained 34D-A palette (pink / violet / blue / teal / gold) for stages
// without an explicit color.
const STAGE_ACCENTS = ['#ec4899', '#8b5cf6', '#3b82f6', '#14b8a6', '#f59e0b']

export function formatVolume(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return ''
  const k = v / 1000
  if (k >= 1000) return `$${Math.round(k).toLocaleString()}K`
  return `$${(Math.round(k * 10) / 10).toLocaleString()}K`
}

type StageGroup = { id: string; name: string; color?: string | null }

interface Props {
  groups: StageGroup[]
  countByGroup: Record<string, number>
  valueByGroup: Record<string, number>
  hasValues: boolean
  emphasizedGroupId: string | null
}

export function BoardStageSummary({ groups, countByGroup, valueByGroup, hasValues, emphasizedGroupId }: Props) {
  if (groups.length < 2) return null

  const scrollToGroup = (id: string) => {
    document.getElementById(`group-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="overflow-x-auto pb-1">
      <div className="flex items-stretch gap-2 min-w-max">
        {groups.map((g, i) => {
          const accent = g.color || STAGE_ACCENTS[i % STAGE_ACCENTS.length]
          const count = countByGroup[g.id] ?? 0
          const value = valueByGroup[g.id] ?? 0
          const emphasized = g.id === emphasizedGroupId

          return (
            <Fragment key={g.id}>
              <button
                type="button"
                onClick={() => scrollToGroup(g.id)}
                title={`Jump to ${g.name}`}
                className={cn(
                  'group/stage min-w-[140px] flex-shrink-0 rounded-lg bg-card px-3 py-2 text-left transition-colors',
                  emphasized ? 'premium-surface' : 'border border-border hover:border-primary/40',
                )}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded px-1 text-[10px] font-semibold tabular-nums"
                    style={{ color: accent, borderColor: accent, borderWidth: 1 }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground group-hover/stage:text-foreground">
                    {g.name}
                  </span>
                </div>
                <div className="mt-1 flex items-baseline gap-1.5">
                  <span className="text-lg font-bold tabular-nums text-foreground">{count}</span>
                  {hasValues && value > 0 && (
                    <span className="text-2xs tabular-nums text-muted-foreground">{formatVolume(value)}</span>
                  )}
                </div>
                {/* Thin colored base accent — hierarchy, not decoration. */}
                <div className="mt-1.5 h-0.5 w-full rounded-full" style={{ background: accent, opacity: emphasized ? 0.7 : 0.35 }} />
              </button>

              {i < groups.length - 1 && (
                <ChevronRight className="h-4 w-4 flex-shrink-0 self-center text-muted-foreground/40" />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}
