'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardPhaseSummaryGraph (Phase 5H) — the pipeline header above the board. A
// centered title + KPI row (total contacts, pipeline value, leading stage) over
// a row of per-stage circular ring indicators. Replaces the old horizontal
// segmented funnel bar. Presentational only — all metrics are derived from the
// already-loaded, visible/filtered record set passed in as props (no queries,
// no engine/schema changes). Works for any board/pipeline with ≥2 stages.
// ─────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'
import { stageColor, formatVolume } from './BoardStageSummary'

// Graph-only soft palette for the ring FILL — lighter than the Kanban columns
// (which keep stageColor) but saturated enough to read against the neutral ring
// track. Index-based fallback when a group has no own color.
const PASTEL_STAGE = ['#4f86c6', '#5a9e63', '#c9962f', '#c56b48', '#8a64b8', '#3f9e92', '#6376b8']

// Neutral track behind the ring fill — a warm cream-tan that stays distinct from
// both the card surface (so the unfilled arc still reads as a ring) and the soft
// fills (so the filled portion is legible).
const RING_TRACK = '#f0e8da'

/** Soft version of a stage color for the ring fill (Kanban columns are
 *  untouched). A group's own color is softened toward white so it stays in the
 *  same hue family as its column but reads light; otherwise a soft fallback. */
function pastelStageColor(group: { color?: string | null }, index: number): string {
  return group.color
    ? `color-mix(in srgb, ${stageColor(group, index)} 90%, #ffffff)`
    : PASTEL_STAGE[index % PASTEL_STAGE.length]
}

type StageGroup = { id: string; name: string; color?: string | null }

interface Props {
  groups: StageGroup[]
  /** Visible count per group id (pass filtered counts so it matches the board). */
  countByGroup: Record<string, number>
  /** Visible loan volume per group id (sum of record value; filtered set). */
  valueByGroup?: Record<string, number>
  /** Visible count of records that carry a value (for the safe average). */
  valuedCountByGroup?: Record<string, number>
  /** Phase / board name, shown as the centered title. */
  phaseLabel?: string
}

export function BoardPhaseSummaryGraph({ groups, countByGroup, valueByGroup, valuedCountByGroup, phaseLabel }: Props) {
  if (groups.length < 2) return null

  const segments = groups.map((g, i) => ({
    id: g.id,
    name: g.name,
    color: pastelStageColor(g, i),
    count: countByGroup[g.id] ?? 0,
    value: valueByGroup?.[g.id] ?? 0,
    valuedCount: valuedCountByGroup?.[g.id] ?? 0,
  }))

  const total = segments.reduce((s, x) => s + x.count, 0)
  const totalValue = segments.reduce((s, x) => s + x.value, 0)
  const valuedTotal = segments.reduce((s, x) => s + x.valuedCount, 0)
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)

  // Leading stage = the one with the highest visible contact count.
  const leading = segments.reduce((a, b) => (b.count > a.count ? b : a), segments[0])
  // Safe average loan: total value ÷ records that actually carry a value (skip
  // when none, so we never divide by zero or dilute with blank records).
  const avgLoan = valuedTotal > 0 ? totalValue / valuedTotal : 0

  return (
    <div className="rounded-xl border border-jubo-border bg-jubo-card p-4 shadow-sm">
      {/* Centered title area. */}
      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="inline-flex items-center rounded-full bg-jubo-gold-soft px-2 py-0.5 text-2xs font-semibold uppercase tracking-wider text-jubo-gold">
          Pipeline
        </span>
        {phaseLabel && (
          <h3 className="text-lg font-bold leading-tight tracking-tight text-jubo-navy sm:text-xl">{phaseLabel}</h3>
        )}
      </div>

      {/* KPI row — three centered metrics. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          value={String(total)}
          label="Contacts in phase"
        />
        <KpiCard
          value={formatVolume(totalValue) || '—'}
          label="Pipeline value"
          hint={avgLoan > 0 ? `Avg ${formatVolume(avgLoan)}` : undefined}
        />
        <KpiCard
          value={total > 0 ? String(leading.count) : '—'}
          label={total > 0 ? `At "${leading.name}"` : 'Leading stage'}
          hint={total > 0 ? `${pct(leading.count)}% of contacts` : undefined}
        />
      </div>

      {/* Stage breakdown — one circular ring per stage. Wraps for any count. */}
      <div className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-4 border-t border-jubo-border/70 pt-4">
        {segments.map((s, i) => (
          <StageRing
            key={s.id}
            color={s.color}
            count={s.count}
            share={total > 0 ? s.count / total : 0}
            index={i}
            name={s.name}
            value={s.value}
            percent={pct(s.count)}
          />
        ))}
      </div>
    </div>
  )
}

/** One KPI block: big number, label, optional small hint line. */
function KpiCard({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-jubo-border bg-jubo-card-soft px-3 py-2.5 text-center">
      <span className="text-3xl font-bold tabular-nums leading-none text-jubo-navy">{value}</span>
      <span className="mt-1.5 text-2xs font-semibold uppercase tracking-wider text-jubo-muted">{label}</span>
      {hint && <span className="mt-0.5 text-2xs tabular-nums text-jubo-text-soft">{hint}</span>}
    </div>
  )
}

/** A single stage's circular ring + labels. CSS-only conic-gradient ring with a
 *  cream/tan neutral track and a centered navy count; no charting library. */
function StageRing({
  color, count, share, index, name, value, percent,
}: {
  color: string
  count: number
  share: number   // 0..1 fraction of total contacts
  index: number
  name: string
  value: number
  percent: number
}) {
  const deg = Math.max(0, Math.min(1, share)) * 360
  const volume = formatVolume(value)
  return (
    <div className="flex w-28 flex-shrink-0 flex-col items-center text-center">
      {/* Ring: conic fill over a tan track; inner cream disc holds the count. */}
      <div
        className="relative h-16 w-16 flex-shrink-0 rounded-full"
        style={{ background: `conic-gradient(${color} ${deg}deg, ${RING_TRACK} 0deg)` }}
        aria-hidden
      >
        <div className="absolute inset-[6px] flex items-center justify-center rounded-full bg-jubo-card">
          <span className="text-lg font-bold tabular-nums leading-none text-jubo-navy">{count}</span>
        </div>
      </div>
      {/* Stage number. */}
      <span className="mt-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-jubo-card-soft px-1.5 text-2xs font-semibold tabular-nums text-jubo-muted">
        {index + 1}
      </span>
      {/* Stage name. */}
      <span className={cn('mt-1 max-w-full truncate text-xs font-semibold leading-tight text-jubo-navy')} title={name}>
        {name}
      </span>
      {/* Stage loan value. */}
      <span className="mt-0.5 text-2xs tabular-nums text-jubo-text-soft">{volume || '—'}</span>
      {/* Percent of contacts. */}
      <span className="text-2xs tabular-nums text-jubo-muted">{percent}% of contacts</span>
    </div>
  )
}
