'use client'

// ─────────────────────────────────────────────────────────────────────────
// Manual Greatness Tracker — shared model (rework Phase 2 extraction).
//
// ONE home for the manual weekly tracker's row definitions, sanitize/math
// helpers, and localStorage keys, so the grid (WeeklyActivityGrid) and the
// Manual vs Verified comparison can never disagree. Everything here is
// pure or per-browser localStorage — manual entries are scoreboard-only
// and never touch CRM data.
//
// A tiny same-tab store (subscribe/notify + useSyncExternalStore, the
// established repo pattern) lets the comparison update live while the LO
// types into the grid; cross-tab updates ride the native storage event.
// ─────────────────────────────────────────────────────────────────────────

import { useMemo, useSyncExternalStore } from 'react'
import { mondayKeyOf } from '@/features/metrics/shared'
import { LOCAL_KEYS } from '@/lib/localKeys'

// Fixed activity rows + weekly goals (product spec). Goals sum to 30.
export const ACTIVITIES = [
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

export type ManualActivityKey = (typeof ACTIVITIES)[number]['key']

export const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
export const GOAL_TOTAL = ACTIVITIES.reduce((s, a) => s + a.goal, 0) // = 30

/** Cell values are kept as strings so a cleared input stays visually empty
 *  ('' counts as 0 in every total — never NaN). */
export type ManualGrid = Record<string, string[]>

export const emptyGrid = (): ManualGrid => Object.fromEntries(ACTIVITIES.map((a) => [a.key, ['', '', '', '', '']]))

/** This ISO week's Monday as YYYY-MM-DD (local) — the week identity.
 *  (Shared Monday-week helper + key registry; formats unchanged.) */
export function mondayKey(): string {
  return mondayKeyOf(new Date())
}
export const valuesKey = (userId: string) => LOCAL_KEYS.greatnessValues(userId, mondayKey())
export const collapseKey = (userId: string) => LOCAL_KEYS.greatnessCollapsed(userId)

/** Non-negative integers only: strip non-digits, no decimals/negatives,
 *  clamp to 0–999. Empty stays empty (counts as 0). */
export function sanitizeCell(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits === '') return ''
  return String(Math.min(999, parseInt(digits, 10)))
}

export const cellNum = (v: string): number => (v === '' ? 0 : Number(v))

/** Wk Ttl for one activity row: Mon+Tue+Wed+Thu+Fri, empty cells = 0. */
export const gridRowTotal = (grid: ManualGrid, key: string): number =>
  (grid[key] ?? []).reduce((s, v) => s + cellNum(v), 0)

// ── Same-tab change store ───────────────────────────────────────────────
const listeners = new Set<() => void>()

/** Called by the grid after every localStorage write so same-tab readers
 *  (Manual vs Verified) re-read instantly. */
export function notifyManualTracker(): void {
  listeners.forEach((cb) => cb())
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

/** Live per-activity weekly totals from THIS week's manual grid — the exact
 *  same localStorage the grid writes; all zeros on the server / when empty. */
export function useManualWeekTotals(userId?: string): Record<string, number> {
  const uid = userId ?? ''
  const raw = useSyncExternalStore(
    subscribe,
    () => { try { return window.localStorage.getItem(valuesKey(uid)) } catch { return null } },
    () => null,
  )
  return useMemo(() => {
    const totals: Record<string, number> = Object.fromEntries(ACTIVITIES.map((a) => [a.key, 0]))
    if (!raw) return totals
    try {
      const saved = JSON.parse(raw) as ManualGrid
      for (const a of ACTIVITIES) {
        const row = saved[a.key]
        if (Array.isArray(row)) totals[a.key] = row.slice(0, 5).reduce((s, v) => s + cellNum(sanitizeCell(String(v ?? ''))), 0)
      }
    } catch { /* zeros stand */ }
    return totals
  }, [raw])
}
