'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardPhaseSummaryGraph (Phase 5H) — the consolidated "phase at a glance"
// tracker above the board, redesigned to match the MOS reference:
//   • centered board title + a small "Pipeline" badge
//   • optional centered role/context chips (only when a SAFE structured source
//     is supplied — never parsed/invented here)
//   • a single rounded cream KPI band: Contacts · Pipeline value · Leading stage
//   • a "BY STAGE · CONTACTS & VALUE" header with total pipeline value on the right
//   • one ring per stage (count inside, name / amount / % of contacts below)
// Presentational only — every number is derived from the (filtered/visible)
// counts and values passed in. No queries, no schema, no engine changes.
// ─────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'
import { stageColor, formatVolume } from './BoardStageSummary'

// Softened ring palette (carried over from the tuned KPI/ring header) so the MOS
// redesign uses the same calm pastels rather than full-saturation stage colors.
const PASTEL_STAGE = ['#4f86c6', '#5a9e63', '#c9962f', '#c56b48', '#8a64b8', '#3f9e92', '#6376b8']
const RING_TRACK = '#f0e8da'
function pastelStageColor(group: { color?: string | null }, index: number): string {
  return group.color
    ? `color-mix(in srgb, ${stageColor(group, index)} 90%, #ffffff)`
    : PASTEL_STAGE[index % PASTEL_STAGE.length]
}

type StageGroup = { id: string; name: string; color?: string | null }

/** A role/context chip (e.g. { label: 'LC', name: 'Jason Blevins' }). Only ever
 *  rendered from a caller-supplied structured list — this component never parses
 *  free text into roles, so it can't invent people. */
type RoleChip = { label: string; name: string }

interface Props {
  groups: StageGroup[]
  /** Visible count per group id (pass filtered counts so it matches the board). */
  countByGroup: Record<string, number>
  /** Visible loan volume per group id (sum of record value; filtered set). */
  valueByGroup?: Record<string, number>
  /** Visible count of records that carry a value — for a safe average loan. */
  valuedCountByGroup?: Record<string, number>
  /** Board / phase name, shown as the centered title. */
  phaseLabel?: string
  /** Small pill beside the title (e.g. the board type). Hidden when absent. */
  badge?: string
  /** Centered role chips. Omit/empty → the chip row is hidden (never invented). */
  roleChips?: RoleChip[]
}

/** One stage ring: a soft tan track with a colored arc proportional to the
 *  stage's share of contacts, and the count centered inside. */
function StageRing({ pct, color, count }: { pct: number; color: string; count: number }) {
  // Floor the *arc* (not the label) so a non-empty-but-tiny stage stays visible,
  // mirroring the reference where 3% stages still show a small colored cap.
  const arc = count > 0 ? Math.min(100, Math.max(pct, 4)) : 0
  return (
    <div className="relative h-[68px] w-[68px]">
      <svg viewBox="0 0 68 68" className="h-full w-full -rotate-90">
        <circle cx="34" cy="34" r="28" fill="none" stroke={RING_TRACK} strokeWidth="6.5" />
        {arc > 0 && (
          <circle
            cx="34" cy="34" r="28" fill="none"
            stroke={color} strokeWidth="6.5" strokeLinecap="round"
            pathLength={100} strokeDasharray={`${arc} ${100 - arc}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold tabular-nums text-jubo-navy">{count}</span>
      </div>
    </div>
  )
}

export function BoardPhaseSummaryGraph({ groups, countByGroup, valueByGroup, valuedCountByGroup, phaseLabel, badge, roleChips }: Props) {
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
  // Average over records that actually carry a value (falls back to total when
  // valued counts aren't supplied), so blank/$0 records don't dilute it.
  const avgLoan = valuedTotal > 0 ? totalValue / valuedTotal : (total > 0 ? totalValue / total : 0)

  // Leading stage = the one holding the most contacts (matches the "Contacts in
  // phase" framing of the KPI band). First stage wins ties.
  const leading = segments.reduce((a, b) => (b.count > a.count ? b : a), segments[0])

  const chips = roleChips?.filter((c) => c.label || c.name) ?? []

  return (
    <div className="rounded-xl border border-jubo-border bg-jubo-card p-4 shadow-sm">
      {/* Title — centered, with an optional small pill badge. */}
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
        <h3 className="text-lg font-bold leading-tight text-jubo-navy">{phaseLabel ?? 'Pipeline'}</h3>
        {badge && (
          <span className="rounded-full border border-jubo-green/25 bg-jubo-green-soft px-2 py-0.5 text-2xs font-semibold capitalize text-jubo-green">
            {badge}
          </span>
        )}
      </div>

      {/* Role / context chips — only when a safe structured list was supplied. */}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-1.5">
          {chips.map((c, i) => (
            <span
              key={`${c.label}-${i}`}
              className="inline-flex items-center gap-1.5 rounded-full border border-jubo-border bg-jubo-card-soft px-2.5 py-1 text-xs"
            >
              {c.label && <span className="font-semibold text-jubo-navy">{c.label}</span>}
              {c.name && <span className="text-jubo-muted">{c.name}</span>}
            </span>
          ))}
        </div>
      )}

      {/* KPI band — one rounded cream container, centered cluster, subtle dividers. */}
      <div className="mt-3 rounded-2xl border border-jubo-border bg-jubo-card-soft/60 px-5 py-3.5">
        <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
          {/* Contacts in phase */}
          <div className="border-l-2 border-jubo-green pl-3.5">
            <div className="text-3xl font-bold leading-none tabular-nums text-jubo-navy">{total}</div>
            <div className="mt-1.5 text-xs text-jubo-muted">Contacts in phase</div>
          </div>

          {/* Pipeline value (only when there is any) */}
          {totalValue > 0 && (
            <div className="border-l-2 border-jubo-gold pl-3.5">
              <div className="text-3xl font-bold leading-none tabular-nums text-jubo-navy">{formatVolume(totalValue)}</div>
              <div className="mt-1.5 text-xs text-jubo-muted">Pipeline value</div>
              {avgLoan > 0 && (
                <div className="text-2xs font-medium text-jubo-green">{formatVolume(avgLoan)} avg loan</div>
              )}
            </div>
          )}

          {/* Leading stage */}
          {leading && leading.count > 0 && (
            <div className="border-l border-jubo-border pl-3.5">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold leading-none tabular-nums text-jubo-navy">{leading.count}</span>
                <span className="text-sm font-semibold text-jubo-green">{pct(leading.count)}%</span>
              </div>
              <div className="mt-1.5 max-w-[12rem] truncate text-xs text-jubo-muted">At “{leading.name}”</div>
            </div>
          )}
        </div>
      </div>

      {/* Stage section header — label · divider · total pipeline value. */}
      <div className="mt-4 flex items-center gap-3">
        <span className="whitespace-nowrap text-2xs font-semibold uppercase tracking-wider text-jubo-muted">
          By Stage · Contacts &amp; Value
        </span>
        <div className="h-px flex-1 bg-jubo-border" />
        {totalValue > 0 && (
          <span className="whitespace-nowrap text-xs font-semibold text-jubo-navy">{formatVolume(totalValue)} total</span>
        )}
      </div>

      {/* Ring row — one ring per stage; wraps cleanly, evenly spaced. */}
      <div className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-5">
        {segments.map((s, i) => (
          <div
            key={s.id}
            className={cn('flex min-w-[6.5rem] flex-1 basis-[6.5rem] flex-col items-center text-center')}
            title={`${s.name}: ${s.count}${s.value > 0 ? ` · ${formatVolume(s.value)}` : ''} (${pct(s.count)}%)`}
          >
            <StageRing pct={pct(s.count)} color={s.color} count={s.count} />
            <div className="mt-2 text-sm leading-tight">
              <span className="tabular-nums text-jubo-muted">{i + 1}</span>{' '}
              <span className="font-semibold text-jubo-navy">{s.name}</span>
            </div>
            <div className="mt-0.5 text-sm font-bold tabular-nums text-jubo-text-soft">
              {formatVolume(s.value) || '—'}
            </div>
            <div className="text-xs tabular-nums text-jubo-muted">{pct(s.count)}% of contacts</div>
          </div>
        ))}
      </div>
    </div>
  )
}
