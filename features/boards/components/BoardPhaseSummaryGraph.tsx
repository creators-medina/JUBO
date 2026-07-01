'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardPhaseSummaryGraph (Phase 5M) — the compact board "Top Phase Summary"
// header, matching the uploaded reference:
//   • LEFT: board title + a small "Pipeline" badge, with optional role chips.
//   • RIGHT: a compact KPI cluster (contacts · pipeline value · leading stage).
//   • a thin divider, then a "BY STAGE · CONTACTS & VALUE" label row (+ total).
//   • rounded stage pills: a small count ring, the stage name, and its value.
// Flat strip (no big boxed card) so the board columns sit close to the top.
//
// Every number is derived from the already-loaded, visible/filtered counts &
// values passed in — no queries, no engine/schema changes. A per-board display
// settings object toggles what shows; hiding money only HIDES it (values are
// never changed or deleted).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, Check } from 'lucide-react'
import { stageColor, formatVolume } from './BoardStageSummary'
import { cn } from '@/lib/utils'

const RING_TRACK = '#f0e8da'

export type BoardDisplaySettings = {
  showMoney?: boolean
  showContacts?: boolean
  showLeadingStage?: boolean
  showRoleChips?: boolean
  showStageValues?: boolean
}

/** A role/context chip (e.g. { label: 'LC', name: 'Jason Blevins' }). Rendered
 *  ONLY from a caller-supplied list — never parsed/invented here. */
export type RoleChip = { label: string; name: string }

type StageGroup = { id: string; name: string; color?: string | null }

interface Props {
  groups: StageGroup[]
  countByGroup: Record<string, number>
  valueByGroup?: Record<string, number>
  valuedCountByGroup?: Record<string, number>
  phaseLabel?: string
  /** Small pill beside the title (e.g. the board type). Hidden when absent. */
  badge?: string
  /** Role chips — omit/empty → the chip row is hidden (never invented). */
  roleChips?: RoleChip[]
  /** Per-board display prefs (undefined values default to shown). */
  settings?: BoardDisplaySettings
  /** Persist a settings change; the parent owns state + storage. */
  onChangeSettings?: (next: BoardDisplaySettings) => void
}

export function BoardPhaseSummaryGraph({
  groups, countByGroup, valueByGroup, valuedCountByGroup, phaseLabel, badge, roleChips, settings, onChangeSettings,
}: Props) {
  if (groups.length < 2) return null

  // Resolve toggles (undefined → shown). Money is the master switch for every
  // dollar figure; stage values additionally gate the per-stage amounts.
  const showMoney = settings?.showMoney !== false
  const showContacts = settings?.showContacts !== false
  const showLeading = settings?.showLeadingStage !== false
  const showChips = settings?.showRoleChips !== false
  const showStageValues = showMoney && settings?.showStageValues !== false

  const segments = groups.map((g, i) => ({
    id: g.id,
    name: g.name,
    color: stageColor(g, i),
    count: countByGroup[g.id] ?? 0,
    value: valueByGroup?.[g.id] ?? 0,
    valuedCount: valuedCountByGroup?.[g.id] ?? 0,
  }))

  const total = segments.reduce((s, x) => s + x.count, 0)
  const totalValue = segments.reduce((s, x) => s + x.value, 0)
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0)
  const leading = segments.reduce((a, b) => (b.count > a.count ? b : a), segments[0])

  const chips = showChips ? (roleChips?.filter((c) => c.label || c.name) ?? []) : []
  const stageLabel = showMoney ? 'By Stage · Contacts & Value' : 'By Stage · Contacts'

  return (
    <div className="relative border-b border-jubo-border/60 px-0.5 pb-2.5">
      {/* Top row — left: title + badge + chips · right: KPI cluster + settings. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        {/* Left cluster */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {phaseLabel && (
              <h3 className="truncate text-base font-bold leading-tight tracking-tight text-jubo-navy sm:text-lg" title={phaseLabel}>
                {phaseLabel}
              </h3>
            )}
            {badge && (
              <span className="inline-flex items-center rounded-full border border-jubo-green/25 bg-jubo-green-soft px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-jubo-green">
                {badge}
              </span>
            )}
          </div>
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {chips.map((c, i) => (
                <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-jubo-border bg-jubo-card-soft px-2 py-0.5 text-[11px] leading-tight">
                  {c.label && <span className="font-semibold text-jubo-navy">{c.label}</span>}
                  {c.name && <span className="text-jubo-muted">{c.name}</span>}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Right cluster — compact KPIs + settings gear. */}
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-1">
            {showContacts && <Kpi value={String(total)} unit="contacts" />}
            {showMoney && <Kpi value={formatVolume(totalValue) || '$0'} unit="pipeline" />}
            {showLeading && total > 0 && (
              <Kpi value={String(leading.count)} unit={`${pct(leading.count)}% at ${leading.name}`} />
            )}
          </div>
          {onChangeSettings && (
            <SettingsMenu settings={settings} onChange={onChangeSettings} />
          )}
        </div>
      </div>

      {/* Divider + BY STAGE label row (+ total on the right when money is shown). */}
      <div className="mt-2.5 flex items-center gap-3 border-t border-jubo-border/70 pt-2">
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-jubo-muted">{stageLabel}</span>
        <div className="h-px flex-1 bg-jubo-border/70" />
        {showMoney && totalValue > 0 && (
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-jubo-navy">{formatVolume(totalValue)} total</span>
        )}
      </div>

      {/* Stage pills — ring + count, name, and (optional) value. Wraps cleanly. */}
      <div className="mt-2.5 flex flex-wrap gap-2">
        {segments.map((s) => (
          <StagePill
            key={s.id}
            color={s.color}
            count={s.count}
            share={total > 0 ? s.count / total : 0}
            name={s.name}
            value={s.value}
            percent={pct(s.count)}
            showValue={showStageValues}
          />
        ))}
      </div>
    </div>
  )
}

/** One compact KPI: big navy number + a tiny unit label under it. */
function Kpi({ value, unit }: { value: string; unit: string }) {
  return (
    <div className="text-right leading-tight">
      <div className="text-lg font-bold tabular-nums text-jubo-navy">{value}</div>
      <div className="max-w-[13rem] truncate text-[10px] text-jubo-muted">{unit}</div>
    </div>
  )
}

/** A rounded stage pill: small conic count-ring + stage name + optional value. */
function StagePill({
  color, count, share, name, value, percent, showValue,
}: {
  color: string
  count: number
  share: number
  name: string
  value: number
  percent: number
  showValue: boolean
}) {
  const deg = Math.max(0, Math.min(1, share)) * 360
  const volume = formatVolume(value) || '$0'
  return (
    <div
      className="flex w-44 items-center gap-2.5 rounded-xl border border-jubo-border bg-jubo-card-soft/60 px-2.5 py-1.5"
      title={`${name}: ${count} contact${count === 1 ? '' : 's'}${value > 0 ? ` · ${volume}` : ''} · ${percent}% of contacts`}
    >
      {/* Count ring — thin colored arc over a tan track. */}
      <div className="relative h-9 w-9 flex-shrink-0 rounded-full" style={{ background: `conic-gradient(${color} ${deg}deg, ${RING_TRACK} 0deg)` }} aria-hidden>
        <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-jubo-card">
          <span className="text-xs font-bold tabular-nums leading-none" style={{ color }}>{count}</span>
        </div>
      </div>
      <div className="min-w-0">
        <div className="line-clamp-2 text-xs font-semibold leading-tight text-jubo-navy" title={name}>{name}</div>
        {showValue && <div className="mt-0.5 text-xs font-bold tabular-nums leading-tight" style={{ color }}>{volume}</div>}
      </div>
    </div>
  )
}

/** Small gear → popover of display toggles. Persists via onChange (parent owns). */
function SettingsMenu({ settings, onChange }: { settings?: BoardDisplaySettings; onChange: (next: BoardDisplaySettings) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const items: { key: keyof BoardDisplaySettings; label: string }[] = [
    { key: 'showMoney', label: 'Show money' },
    { key: 'showContacts', label: 'Show contacts total' },
    { key: 'showLeadingStage', label: 'Show leading stage' },
    { key: 'showRoleChips', label: 'Show role chips' },
    { key: 'showStageValues', label: 'Show stage values' },
  ]

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Summary display settings"
        className="flex h-7 w-7 items-center justify-center rounded-md text-jubo-muted transition-colors hover:bg-jubo-card-soft hover:text-jubo-text"
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-50 w-52 rounded-lg border border-jubo-border bg-jubo-card p-1 shadow-xl">
          <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-jubo-muted">Summary display</p>
          {items.map(({ key, label }) => {
            const on = settings?.[key] !== false
            return (
              <button
                key={key}
                type="button"
                onClick={() => onChange({ ...settings, [key]: !on })}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs text-jubo-text hover:bg-jubo-card-soft"
              >
                <span>{label}</span>
                <span className={cn('flex h-4 w-4 items-center justify-center rounded border', on ? 'border-jubo-green bg-jubo-green text-white' : 'border-jubo-border text-transparent')}>
                  <Check className="h-3 w-3" />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
