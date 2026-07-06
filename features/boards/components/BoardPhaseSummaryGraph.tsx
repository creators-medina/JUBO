'use client'

// ─────────────────────────────────────────────────────────────────────────
// BoardPhaseSummaryGraph — the board "Top Phase Summary", matching the Header
// Redesign reference:
//   • stat cards: [Contacts] [$ Pipeline] [This-week ring — X of N contacted]
//   • a "BY STAGE · PROGRESS" label row (+ total value on the right)
//   • rounded stage pills: mini progress ring (% contacted this week), the
//     stage name, and "count · $value".
// The board title/badge live in the page header above — never duplicated here.
//
// Every number is derived from the already-loaded counts/values plus the
// read-only contacted-this-week map passed in — no queries here, no engine or
// schema changes. The per-board display settings object toggles what shows;
// hiding money only HIDES it (values are never changed or deleted).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal, Check, Users, DollarSign } from 'lucide-react'
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
  /** Distinct records contacted (non-internal comm log) since Monday — total
   *  plus per-stage counts. Omitted → the week card and rings hide/show 0. */
  contactedThisWeek?: { total: number; byGroup: Record<string, number> }
  /** Role chips — omit/empty → the chip row is hidden (never invented). */
  roleChips?: RoleChip[]
  /** Per-board display prefs (undefined values default to shown). */
  settings?: BoardDisplaySettings
  /** Persist a settings change; the parent owns state + storage. */
  onChangeSettings?: (next: BoardDisplaySettings) => void
}

export function BoardPhaseSummaryGraph({
  groups, countByGroup, valueByGroup, valuedCountByGroup, contactedThisWeek, roleChips, settings, onChangeSettings,
}: Props) {
  if (groups.length < 2) return null

  // Resolve toggles (undefined → shown). Money is the master switch for every
  // dollar figure; stage values additionally gate the per-stage amounts.
  const showMoney = settings?.showMoney !== false
  const showContacts = settings?.showContacts !== false
  const showChips = settings?.showRoleChips !== false
  const showStageValues = showMoney && settings?.showStageValues !== false

  const segments = groups.map((g, i) => ({
    id: g.id,
    name: g.name,
    color: stageColor(g, i),
    count: countByGroup[g.id] ?? 0,
    value: valueByGroup?.[g.id] ?? 0,
    valuedCount: valuedCountByGroup?.[g.id] ?? 0,
    contacted: contactedThisWeek?.byGroup?.[g.id] ?? 0,
  }))

  const total = segments.reduce((s, x) => s + x.count, 0)
  const totalValue = segments.reduce((s, x) => s + x.value, 0)
  const contacted = Math.min(contactedThisWeek?.total ?? 0, total)
  const weekPct = total > 0 ? Math.round((contacted / total) * 100) : 0

  const chips = showChips ? (roleChips?.filter((c) => c.label || c.name) ?? []) : []
  const stageLabel = 'By Stage · Progress'

  return (
    <div className="relative border-b border-jubo-border/60 px-0.5 pb-2.5">
      {/* Stat cards — Contacts · $ Pipeline · This-week outreach ring. */}
      <div className="flex flex-wrap items-stretch gap-2.5">
        {showContacts && (
          <StatCard icon={<Users className="h-4 w-4" />} iconClass="bg-jubo-navy/10 text-jubo-navy" value={String(total)} label="Contacts" />
        )}
        {showMoney && (
          <StatCard icon={<DollarSign className="h-4 w-4" />} iconClass="bg-jubo-gold-soft text-jubo-gold" value={formatVolume(totalValue) || '$0'} label="Pipeline" />
        )}
        {contactedThisWeek && total > 0 && (
          <div className="flex min-w-[16rem] flex-1 items-center gap-3 rounded-xl border border-jubo-border bg-jubo-card-soft/60 px-3.5 py-2.5">
            <Ring percent={weekPct} color="var(--jubo-green)" size={53}>
              <span className="text-xs font-bold tabular-nums text-jubo-navy">{weekPct}%</span>
            </Ring>
            <div className="min-w-0 leading-tight">
              <p className="text-sm font-bold text-jubo-navy">This week</p>
              <p className="truncate text-xs text-jubo-muted tabular-nums">
                {contacted} of {total} contacted this week
              </p>
            </div>
          </div>
        )}
        {onChangeSettings && (
          <div className="ml-auto self-start">
            <SettingsMenu settings={settings} onChange={onChangeSettings} />
          </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {chips.map((c, i) => (
            <span key={`${c.label}-${i}`} className="inline-flex items-center gap-1.5 rounded-full border border-jubo-border bg-jubo-card-soft px-2 py-0.5 text-[11px] leading-tight">
              {c.label && <span className="font-semibold text-jubo-navy">{c.label}</span>}
              {c.name && <span className="text-jubo-muted">{c.name}</span>}
            </span>
          ))}
        </div>
      )}

      {/* Divider + BY STAGE · PROGRESS label row (+ total when money shows). */}
      <div className="mt-2.5 flex items-center gap-3 pt-0.5">
        <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-wider text-jubo-gold">{stageLabel}</span>
        <div className="h-px flex-1 bg-jubo-border/70" />
        {showMoney && totalValue > 0 && (
          <span className="whitespace-nowrap text-xs font-semibold tabular-nums text-jubo-navy">{formatVolume(totalValue)} total</span>
        )}
      </div>

      {/* Stage pills — mini progress ring (% contacted this week) · name ·
          count (· value). Wraps cleanly. */}
      <div className="mt-2 flex flex-wrap gap-2">
        {segments.map((s) => {
          const pct = s.count > 0 ? Math.round((Math.min(s.contacted, s.count) / s.count) * 100) : 0
          return (
            <div
              key={s.id}
              className="flex items-center gap-2.5 rounded-full border border-jubo-border bg-jubo-card px-3 py-2 shadow-sm"
              title={`${s.name}: ${s.count} contact${s.count === 1 ? '' : 's'}${showStageValues ? ` · ${formatVolume(s.value) || '$0'}` : ''} · ${Math.min(s.contacted, s.count)} contacted this week`}
            >
              <Ring percent={pct} color={s.color} size={31}>
                <span className="text-[9px] font-bold tabular-nums leading-none" style={{ color: s.color }}>{pct}%</span>
              </Ring>
              <span className="max-w-[10rem] truncate text-[13px] font-semibold text-jubo-navy" title={s.name}>{s.name}</span>
              <span className="text-[13px] font-semibold tabular-nums text-jubo-text">{s.count}</span>
              {showStageValues && (
                <span className="text-[13px] font-bold tabular-nums" style={{ color: s.color }}>· {formatVolume(s.value) || '$0'}</span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** One stat card: icon chip + big number over a small label. */
function StatCard({ icon, iconClass, value, label }: { icon: React.ReactNode; iconClass: string; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-jubo-border bg-jubo-card-soft/60 px-3.5 py-2.5">
      <span className={cn('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', iconClass)}>{icon}</span>
      <div className="leading-tight">
        <p className="text-lg font-bold tabular-nums text-jubo-navy">{value}</p>
        <p className="text-[10px] text-jubo-muted">{label}</p>
      </div>
    </div>
  )
}

/** Thin conic progress ring with centered content. */
function Ring({ percent, color, size, children }: { percent: number; color: string; size: number; children: React.ReactNode }) {
  const deg = Math.max(0, Math.min(100, percent)) * 3.6
  return (
    <div
      className="relative flex-shrink-0 rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${color} ${deg}deg, ${RING_TRACK} 0deg)` }}
      aria-hidden
    >
      <div className="absolute inset-[3px] flex items-center justify-center rounded-full bg-jubo-card">{children}</div>
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
