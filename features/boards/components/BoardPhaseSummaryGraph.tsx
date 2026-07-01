'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardPhaseSummaryGraph (Phase 5H → 5I compact) — the pipeline header above
// the board, in a deliberately SHORT form so the cards below aren't pushed
// down: badge + title on one centered line, a single compact KPI band
// (contacts · pipeline value · leading stage), and a tight per-stage row where
// every stage shows its count (in a small ring), name, and — prominently — its
// total dollar value. Percent is kept but demoted to the hover tooltip to save
// height. Presentational only — all metrics are derived from the already-loaded,
// visible/filtered record set passed in as props (no queries, no engine/schema
// changes). Works for any board/pipeline with ≥2 stages.
// ─────────────────────────────────────────────────────────────────────────

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
    <div className="border-b border-jubo-border/60 px-0.5 pb-2.5">
      {/* Row 1 — badge + title on ONE centered line (was stacked → saves height). */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-center">
        <span className="inline-flex items-center rounded-full bg-jubo-gold-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-jubo-gold">
          Pipeline
        </span>
        {phaseLabel && (
          <h3 className="text-base font-bold leading-tight tracking-tight text-jubo-navy">{phaseLabel}</h3>
        )}
      </div>

      {/* Row 2 — compact KPI band: three inline metrics with thin dividers. */}
      <div className="mx-auto mt-2 flex w-fit max-w-full flex-wrap items-stretch justify-center divide-x divide-jubo-border/70">
        <Kpi value={String(total)} label="Contacts in phase" />
        <Kpi
          value={formatVolume(totalValue) || '$0'}
          label="Pipeline value"
          hint={avgLoan > 0 ? `Avg ${formatVolume(avgLoan)}` : undefined}
        />
        <Kpi
          value={total > 0 ? String(leading.count) : '—'}
          label={total > 0 ? `At “${leading.name}”` : 'Leading stage'}
          hint={total > 0 ? `${pct(leading.count)}% of contacts` : undefined}
        />
      </div>

      {/* Row 3 — compact per-stage row: small ring + count, name, and the stage's
          total dollar value (prominent). Percent lives in the tooltip. */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-3">
        {segments.map((s, i) => (
          <StageStat
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

/** One compact KPI: big number + a small label, with an optional inline hint
 *  (kept on the label line so each metric stays a single tidy block). */
function Kpi({ value, label, hint }: { value: string; label: string; hint?: string }) {
  return (
    <div className="flex min-w-[7rem] flex-col items-center justify-center px-4 py-1.5 text-center">
      <span className="text-xl font-bold tabular-nums leading-none text-jubo-navy">{value}</span>
      <span className="mt-1 max-w-[13rem] truncate text-[10px] font-semibold uppercase tracking-wider text-jubo-muted">
        {label}
        {hint && <span className="ml-1 font-medium normal-case tracking-normal text-jubo-text-soft">· {hint}</span>}
      </span>
    </div>
  )
}

/** A single stage's compact stat: a small conic-gradient ring holding the count,
 *  then the stage name and its total dollar value. Percent is exposed via the
 *  tooltip so it doesn't add a line. CSS-only ring; no charting library. */
function StageStat({
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
  const volume = formatVolume(value) || '$0'
  return (
    <div
      className="flex w-24 flex-shrink-0 flex-col items-center text-center"
      title={`${index + 1}. ${name}: ${count} contact${count === 1 ? '' : 's'} · ${volume} · ${percent}% of contacts`}
    >
      {/* Ring: conic fill over a tan track; inner cream disc holds the count. */}
      <div
        className="relative h-11 w-11 flex-shrink-0 rounded-full"
        style={{ background: `conic-gradient(${color} ${deg}deg, ${RING_TRACK} 0deg)` }}
        aria-hidden
      >
        <div className="absolute inset-[4px] flex items-center justify-center rounded-full bg-jubo-card">
          <span className="text-sm font-bold tabular-nums leading-none text-jubo-navy">{count}</span>
        </div>
      </div>
      {/* Stage number + name on one line. */}
      <span className="mt-1 max-w-full truncate text-[11px] font-semibold leading-tight text-jubo-navy" title={name}>
        <span className="tabular-nums text-jubo-muted">{index + 1}</span> {name}
      </span>
      {/* Stage total dollar value — prominent, always shown ($0 when empty). */}
      <span className="text-xs font-bold tabular-nums leading-tight text-jubo-navy">{volume}</span>
    </div>
  )
}
