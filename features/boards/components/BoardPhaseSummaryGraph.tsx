'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardPhaseSummaryGraph (Phase 5G) — one consolidated "phase at a glance" card
// that replaces the redundant per-stage summary chips above the board. A single
// left→right multi-color chevron funnel: every stage in group order, sized by
// its (visible) record count, color-matched to the Kanban columns via the shared
// stageColor() helper, with a one-line takeaway. Presentational only — counts are
// passed in (driven by the filtered/visible set); no queries, no engine changes.
// ─────────────────────────────────────────────────────────────────────────

import { Fragment } from 'react'
import { cn } from '@/lib/utils'
import { stageColor, formatVolume } from './BoardStageSummary'

type StageGroup = { id: string; name: string; color?: string | null }

interface Props {
  groups: StageGroup[]
  /** Visible count per group id (pass filtered counts so it matches the board). */
  countByGroup: Record<string, number>
  /** Visible loan volume per group id (sum of record value; filtered set). */
  valueByGroup?: Record<string, number>
  /** Phase / board name, shown as the eyebrow descriptor. */
  phaseLabel?: string
}

export function BoardPhaseSummaryGraph({ groups, countByGroup, valueByGroup, phaseLabel }: Props) {
  if (groups.length < 2) return null

  const segments = groups.map((g, i) => ({
    id: g.id,
    name: g.name,
    color: stageColor(g, i),
    count: countByGroup[g.id] ?? 0,
    value: valueByGroup?.[g.id] ?? 0,
  }))
  const total = segments.reduce((s, x) => s + x.count, 0)
  const totalValue = segments.reduce((s, x) => s + x.value, 0)
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  // Segment width is proportional to count (so the heaviest stage dominates the
  // bar, like the reference). A small minimum WEIGHT floor keeps zero/low-count
  // stages visible without flattening the proportions; the per-segment min-width
  // below is only a readability floor that triggers horizontal scroll when tight.
  const minWeight = total > 0 ? Math.max(total * 0.06, 1) : 1
  const weight = (count: number) => Math.max(count, minWeight)

  // Heaviest stage (most contacts) + the stage holding the most loan volume, for
  // the takeaway line.
  const heaviest = segments.reduce((a, b) => (b.count > a.count ? b : a), segments[0])
  const topVol = segments.reduce((a, b) => (b.value > a.value ? b : a), segments[0])

  const ARROW = 12 // px — chevron depth; degrades to a flat segment if unsupported.

  return (
    <div className="rounded-xl border border-jubo-border bg-jubo-card p-4 shadow-sm">
      {/* Header: big total + eyebrow descriptors. */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular-nums leading-none text-jubo-text">{total}</span>
          <span className="text-2xs font-semibold uppercase tracking-wider text-jubo-muted">
            Contacts in phase
            {phaseLabel ? <span className="text-jubo-gold"> · {phaseLabel}</span> : null}
            <span className="text-jubo-muted"> · left → right by stage</span>
          </span>
        </div>
        <span className="text-2xs text-jubo-muted">Live from the board below</span>
      </div>

      {/* Chevron funnel — one segment per stage, width ∝ count (min-width keeps
          zero/small stages visible), colored to match the Kanban columns. */}
      <div className="overflow-x-auto pb-0.5">
        <div className="flex min-w-max items-stretch">
          {segments.map((s, i) => {
            const isFirst = i === 0
            const isLast = i === segments.length - 1
            const clip = isLast
              ? undefined
              : `polygon(0 0, calc(100% - ${ARROW}px) 0, 100% 50%, calc(100% - ${ARROW}px) 100%, 0 100%)`
            return (
              <div
                key={s.id}
                className={cn(
                  'relative flex min-h-[5rem] flex-col items-center justify-center px-3 py-2 text-center text-white',
                  isFirst && 'rounded-l-lg',
                  isLast && 'rounded-r-lg',
                )}
                style={{
                  background: s.color,
                  flexGrow: weight(s.count),         // width ∝ count (floored so 0/small stay visible)
                  flexBasis: 0,
                  minWidth: '5.75rem',               // readability floor only (→ scroll when tight)
                  marginLeft: isFirst ? 0 : -ARROW,  // nest into the previous arrow
                  clipPath: clip,
                  paddingLeft: isFirst ? undefined : ARROW + 12,
                  zIndex: segments.length - i,        // earlier segments overlap later ones
                }}
                title={`${s.name}: ${s.count}${s.value > 0 ? ` · ${formatVolume(s.value)}` : ''} (${pct(s.count)}%)`}
              >
                <span className="text-3xl font-bold leading-none tabular-nums drop-shadow-sm">{s.count}</span>
                <span className="mt-1 max-w-full truncate text-xs font-medium leading-tight opacity-95">{s.name}</span>
                <span className="text-xs tabular-nums opacity-90">{formatVolume(s.value) || '—'}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* One-line takeaway — contacts-led, with loan volume when present. */}
      <p className="mt-3 text-sm text-jubo-text-soft">
        {total === 0 ? (
          'No contacts in this phase yet.'
        ) : (
          <>
            <span className="font-medium text-jubo-text">Heaviest at {heaviest.name}</span>
            {' — '}
            {heaviest.count} {heaviest.count === 1 ? 'contact' : 'contacts'}
            {heaviest.value > 0 ? ` totaling ${formatVolume(heaviest.value)}` : ''}
            {'. '}
            {totalValue > 0
              ? <>{formatVolume(totalValue)} across the phase{topVol.id !== heaviest.id && topVol.value > 0 ? <> · most volume in {topVol.name} ({formatVolume(topVol.value)})</> : null}.</>
              : null}
          </>
        )}
      </p>
    </div>
  )
}
