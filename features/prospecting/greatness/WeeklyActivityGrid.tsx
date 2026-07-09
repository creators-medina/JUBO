'use client'

// ─────────────────────────────────────────────────────────────────────────
// Greatness Tracker — the MANUAL weekly activity grid (rework Phase 1).
//
// A scoreboard the LO fills in by hand inside the Daily Call Log hero:
// Mon–Fri counts per activity, live weekly totals, and a 30-point weekly
// goal. This is self-reported activity — it is NOT the automated CRM
// metrics (those live below as "Verified Results") and it writes to
// NOTHING in the CRM: no communication_logs, no records, no movements, no
// lead_source, no boards.
//
// Persistence (gated batch PR 10C): entries save to the approved
// weekly_activity_entries table so the scoreboard survives device
// switches; localStorage keeps the EXACT same keys/format as before as
// the optimistic cache and offline fallback (Manual vs Verified still
// reads it). On load, backend rows win; a week that exists only in this
// browser auto-uploads (current week) or imports via the explicit button
// (past weeks). The collapse preference stays local-only.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
// Shared model (rework Phase 2): rows/goals, sanitize/math, storage keys,
// and the same-tab notify that keeps Manual vs Verified live.
import {
  ACTIVITIES, DAY_LABELS, GOAL_TOTAL, emptyGrid, mondayKey, valuesKey, collapseKey,
  sanitizeCell, gridRowTotal, notifyManualTracker, type ManualGrid,
} from './manualTracker'
import { importPastWeeks, reconcileCurrentWeek, upsertActivityRow } from './trackerSync'

/** Debounce for the per-activity backend upsert — long enough to batch a
 *  multi-digit entry, short enough to survive a quick tab close. */
const SAVE_DEBOUNCE_MS = 500

export function WeeklyActivityGrid({ userId, organizationId }: { userId?: string; organizationId?: string }) {
  const uid = userId ?? ''
  const orgId = organizationId ?? ''
  const canSync = Boolean(uid && orgId)
  const [grid, setGrid] = useState<ManualGrid>(emptyGrid)
  // Condensed by default — first-time users see just the header + total.
  // A saved preference (either direction) always wins over this default.
  const [collapsed, setCollapsed] = useState(true)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  // Backend-save plumbing: pending cells + debounce timer per activity row,
  // flushed on unmount/pagehide so trailing keystrokes aren't lost.
  const pendingRef = useRef<Map<string, string[]>>(new Map())
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())
  const editedRef = useRef(false)

  const flushRow = (key: string) => {
    const cells = pendingRef.current.get(key)
    pendingRef.current.delete(key)
    const t = timersRef.current.get(key)
    if (t) { clearTimeout(t); timersRef.current.delete(key) }
    if (!cells || !canSync) return
    // Fire-and-forget: localStorage already holds the value, so a failed
    // save just means this browser is the only copy until the next edit.
    upsertActivityRow(orgId, uid, mondayKey(), key, cells).catch(() => { /* offline fallback */ })
  }

  const flushAll = () => { for (const key of Array.from(pendingRef.current.keys())) flushRow(key) }

  // SSR-safe hydrate (established repo pattern): localStorage renders
  // instantly, then the backend reconcile settles the source of truth.
  useEffect(() => {
    const localGrid = emptyGrid()
    try {
      const rawVals = window.localStorage.getItem(valuesKey(uid))
      if (rawVals) {
        const saved = JSON.parse(rawVals) as ManualGrid
        for (const a of ACTIVITIES) {
          const row = saved[a.key]
          if (Array.isArray(row)) localGrid[a.key] = DAY_LABELS.map((_, i) => sanitizeCell(String(row[i] ?? '')))
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setGrid(localGrid)
      }
      // Saved preference wins in BOTH directions ('1' = collapsed, '0' =
      // expanded — written by every toggle); no saved value → stay collapsed.
      const savedCollapse = window.localStorage.getItem(collapseKey(uid))
      if (savedCollapse === '0') setCollapsed(false)
    } catch { /* defaults stand */ }

    if (!canSync) return
    let cancelled = false
    reconcileCurrentWeek(orgId, uid, localGrid)
      .then(({ grid: settled, source }) => {
        // Keystrokes made while the fetch was in flight always win.
        if (cancelled || editedRef.current || source !== 'backend') return
        setGrid(settled)
        try { window.localStorage.setItem(valuesKey(uid), JSON.stringify(settled)) } catch { /* view-only */ }
        notifyManualTracker()
      })
      .catch(() => { /* offline — local values stand */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, orgId])

  // Trailing-save safety net: pagehide covers tab close/navigation; the
  // cleanup covers unmount. localStorage always has the value regardless.
  useEffect(() => {
    const onPageHide = () => flushAll()
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      flushAll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setCell = (key: string, dayIdx: number, raw: string) => {
    const v = sanitizeCell(raw)
    editedRef.current = true
    setGrid((prev) => {
      const next = { ...prev, [key]: prev[key].map((c, i) => (i === dayIdx ? v : c)) }
      try { window.localStorage.setItem(valuesKey(uid), JSON.stringify(next)) } catch { /* view-only */ }
      if (canSync) {
        pendingRef.current.set(key, next[key])
        const t = timersRef.current.get(key)
        if (t) clearTimeout(t)
        timersRef.current.set(key, setTimeout(() => flushRow(key), SAVE_DEBOUNCE_MS))
      }
      return next
    })
    // Same-tab readers (Manual vs Verified) re-read instantly.
    notifyManualTracker()
  }

  const runImport = async () => {
    setImportStatus('Importing…')
    try {
      const { imported, skipped } = await importPastWeeks(orgId, uid)
      setImportStatus(
        imported > 0
          ? `Imported ${imported} past week${imported === 1 ? '' : 's'}${skipped > 0 ? ` (${skipped} already saved)` : ''}.`
          : skipped > 0 ? 'All past weeks in this browser are already saved.' : 'No past weeks found in this browser.',
      )
    } catch {
      setImportStatus('Import failed — check your connection and try again.')
    }
  }

  const toggle = () => {
    setCollapsed((c) => {
      try { window.localStorage.setItem(collapseKey(uid), c ? '0' : '1') } catch { /* view-only */ }
      return !c
    })
  }

  const rowTotal = (key: string): number => gridRowTotal(grid, key)
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
          {/* One-time device migration (approved Q3): past weeks saved only
              in this browser upload on demand; weeks already in the account
              are never overwritten. */}
          {canSync && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                onClick={runImport}
                className="text-[11px] font-medium text-white/50 underline decoration-white/25 underline-offset-2 hover:text-white/80"
              >
                Import past weeks from this browser
              </button>
              {importStatus && <span className="text-[11px] text-white/60">{importStatus}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
