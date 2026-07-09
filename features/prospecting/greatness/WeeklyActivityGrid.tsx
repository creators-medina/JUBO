'use client'

// ─────────────────────────────────────────────────────────────────────────
// Greatness Tracker — the MANUAL weekly activity grid (rework Phase 1).
//
// A scoreboard the LO fills in by hand inside the Daily Call Log hero:
// Mon–Fri counts per activity, live weekly totals, and a 30-point weekly
// goal. This is self-reported activity — it is NOT the automated CRM
// metrics (those live below as "Verified Results") and it writes to
// NOTHING in the CRM: no communication_logs, no records, no movements, no
// lead_source, no boards. Persistence is per-browser localStorage, keyed
// by user + ISO week (the week's Monday date), with the collapse state
// stored separately so it sticks across weeks. Backend persistence is
// deliberately deferred — it would need a new table (gated).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Fixed activity rows + weekly goals (product spec). Goals sum to 30.
const ACTIVITIES = [
  { key: 'leads', label: 'Leads', goal: 6 },
  { key: 'credit', label: 'Credit', goal: 3 },
  { key: 'preapp', label: 'PreApp', goal: 2 },
  { key: 'deals', label: 'Deals', goal: 2 },
  { key: 'fundings', label: 'Fundings', goal: 2 },
  { key: 'events', label: 'Events', goal: 0 },
  { key: 'videos', label: 'Videos', goal: 3 },
  { key: 'thank_yous', label: 'Thank Yous', goal: 10 },
  { key: 'face_to_face', label: 'Face to Face', goal: 2 },
] as const

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const GOAL_TOTAL = ACTIVITIES.reduce((s, a) => s + a.goal, 0) // = 30

/** Cell values are kept as strings so a cleared input stays visually empty
 *  ('' counts as 0 in every total — never NaN). */
type Grid = Record<string, string[]>

const emptyGrid = (): Grid => Object.fromEntries(ACTIVITIES.map((a) => [a.key, ['', '', '', '', '']]))

/** This ISO week's Monday as YYYY-MM-DD (local) — the week identity. */
function mondayKey(): string {
  const d = new Date()
  const dow = d.getDay()
  d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1))
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const valuesKey = (userId: string) => `jubo-greatness-tracker:v1:${userId || 'local'}:${mondayKey()}`
const collapseKey = (userId: string) => `jubo-greatness-tracker:v1:${userId || 'local'}:collapsed`

/** Non-negative integers only: strip non-digits, no decimals/negatives,
 *  clamp to 0–999. Empty stays empty (counts as 0). */
function sanitizeCell(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  return String(Math.min(999, parseInt(digits, 10)))
}

const cellNum = (v: string): number => (v === '' ? 0 : Number(v))

export function WeeklyActivityGrid({ userId }: { userId?: string }) {
  const uid = userId ?? ''
  const [grid, setGrid] = useState<Grid>(emptyGrid)
  const [collapsed, setCollapsed] = useState(false)

  // SSR-safe hydrate from localStorage (established repo pattern) — the
  // server renders zeros, the browser restores this week's entries.
  useEffect(() => {
    try {
      const rawVals = window.localStorage.getItem(valuesKey(uid))
      if (rawVals) {
        const saved = JSON.parse(rawVals) as Grid
        const next = emptyGrid()
        for (const a of ACTIVITIES) {
          const row = saved[a.key]
          if (Array.isArray(row)) next[a.key] = DAY_LABELS.map((_, i) => sanitizeCell(String(row[i] ?? '')))
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGrid(next)
      }
      if (window.localStorage.getItem(collapseKey(uid)) === '1') setCollapsed(true)
    } catch { /* defaults stand */ }
  }, [uid])

  const setCell = (key: string, dayIdx: number, raw: string) => {
    const v = sanitizeCell(raw)
    setGrid((prev) => {
      const next = { ...prev, [key]: prev[key].map((c, i) => (i === dayIdx ? v : c)) }
      try { window.localStorage.setItem(valuesKey(uid), JSON.stringify(next)) } catch { /* view-only */ }
      return next
    })
  }

  const toggle = () => {
    setCollapsed((c) => {
      try { window.localStorage.setItem(collapseKey(uid), c ? '0' : '1') } catch { /* view-only */ }
      return !c
    })
  }

  const rowTotal = (key: string): number => (grid[key] ?? []).reduce((s, v) => s + cellNum(v), 0)
  const totalLogged = ACTIVITIES.reduce((s, a) => s + rowTotal(a.key), 0)

  return (
    <div className="mt-6 border-t border-white/10 pt-4">
      {/* ── Collapsible header ── */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={toggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          {collapsed
            ? <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-white/60" aria-hidden />
            : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-white/60" aria-hidden />}
          <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-jubo-gold">Greatness Tracker</span>
          <span className="hidden truncate text-xs text-white/50 sm:inline">This Week · log each day, watch the total build toward goal</span>
        </button>
        <span className="flex-shrink-0 text-xs text-white/70">
          <span className="font-bold tabular-nums text-white">{totalLogged}</span> of {GOAL_TOTAL} logged
        </span>
      </div>

      {/* ── Grid (hidden while collapsed; header + total stay visible) ── */}
      {!collapsed && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/40">
                <th className="py-1.5 pr-3 text-left font-bold">Activity</th>
                {DAY_LABELS.map((d) => <th key={d} className="px-1 py-1.5 text-center font-bold">{d}</th>)}
                <th className="px-2 py-1.5 text-center font-bold">Wk Ttl</th>
                <th className="pl-2 py-1.5 text-center font-bold">Goal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.07]">
              {ACTIVITIES.map((a) => (
                <tr key={a.key}>
                  <td className="py-1 pr-3 text-sm font-semibold text-white">{a.label}</td>
                  {DAY_LABELS.map((d, i) => (
                    <td key={d} className="px-1 py-1 text-center">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={grid[a.key]?.[i] ?? ''}
                        placeholder="0"
                        onChange={(e) => setCell(a.key, i, e.target.value)}
                        aria-label={`${a.label} — ${d}`}
                        className="w-11 rounded-md bg-transparent px-1 py-0.5 text-center text-sm tabular-nums text-white/70 placeholder:text-white/25 hover:bg-white/[0.06] focus:bg-white/10 focus:text-white focus:outline-none focus:ring-1 focus:ring-[#D96B57]/60"
                      />
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center text-sm font-bold tabular-nums text-white">{rowTotal(a.key)}</td>
                  <td className="pl-2 py-1 text-center text-sm font-bold tabular-nums text-jubo-gold">{a.goal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
