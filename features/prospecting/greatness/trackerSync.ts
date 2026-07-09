'use client'

// ─────────────────────────────────────────────────────────────────────────
// Manual Greatness Tracker — backend sync (gated batch PR 10C).
//
// Persists the manual weekly grid to `weekly_activity_entries` (PR 10B)
// through the browser Supabase client, with RLS enforcing org membership
// and own-rows-only writes. localStorage stays the optimistic cache and
// offline fallback — the grid renders local values instantly and keeps
// working if these calls fail.
//
// Merge policy (approved in the gated batch plan): once a backend row
// exists for a week it wins over local; the one exception is first load
// of a week that exists ONLY locally, which auto-uploads (current week)
// or waits for the explicit "Import past weeks" button (older weeks).
//
// Manual entries remain scoreboard-only: nothing here touches records,
// communications, metrics, or any other CRM table.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/client'
import { LOCAL_KEYS } from '@/lib/localKeys'
import { ACTIVITIES, cellNum, emptyGrid, mondayKey, sanitizeCell, type ManualGrid } from './manualTracker'

/** DAY_LABELS index (Mon..Fri) → backend column, in order. */
const DAY_COLUMNS = ['monday_count', 'tuesday_count', 'wednesday_count', 'thursday_count', 'friday_count'] as const

const ACTIVITY_KEYS = new Set<string>(ACTIVITIES.map((a) => a.key))

type EntryRow = {
  activity_key: string
  monday_count: number
  tuesday_count: number
  wednesday_count: number
  thursday_count: number
  friday_count: number
}

const rowToCells = (r: EntryRow): string[] =>
  DAY_COLUMNS.map((c) => (r[c] > 0 ? String(r[c]) : ''))

const cellsToCounts = (cells: string[]): Record<(typeof DAY_COLUMNS)[number], number> =>
  Object.fromEntries(DAY_COLUMNS.map((c, i) => [c, cellNum(sanitizeCell(String(cells[i] ?? '')))])) as Record<(typeof DAY_COLUMNS)[number], number>

const gridHasValues = (grid: ManualGrid): boolean =>
  Object.values(grid).some((row) => row.some((v) => cellNum(sanitizeCell(String(v ?? ''))) > 0))

/** This week's backend rows as a ManualGrid, or null when the week has no
 *  rows (distinct from an all-zero week, which returns a grid of zeros). */
export async function fetchWeekGrid(weekKey: string): Promise<ManualGrid | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('weekly_activity_entries')
    .select('activity_key, monday_count, tuesday_count, wednesday_count, thursday_count, friday_count')
    .eq('week_start_date', weekKey)
  if (error || !data || data.length === 0) return null
  const grid = emptyGrid()
  for (const r of data as EntryRow[]) {
    if (ACTIVITY_KEYS.has(r.activity_key)) grid[r.activity_key] = rowToCells(r)
  }
  return grid
}

/** Upsert ONE activity row for a week (the per-keystroke save path,
 *  debounced by the grid). Throws on failure so callers can fall back. */
export async function upsertActivityRow(
  organizationId: string, userId: string, weekKey: string, activityKey: string, cells: string[],
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('weekly_activity_entries')
    .upsert(
      [{
        organization_id: organizationId,
        user_id: userId,
        week_start_date: weekKey,
        activity_key: activityKey,
        ...cellsToCounts(cells),
        updated_by: userId,
      }],
      { onConflict: 'organization_id,user_id,week_start_date,activity_key' },
    )
  if (error) throw new Error(error.message)
}

/** Upload a whole week's grid (import path). Rows are upserted so a re-run
 *  is idempotent. */
export async function uploadWeek(
  organizationId: string, userId: string, weekKey: string, grid: ManualGrid,
): Promise<void> {
  const supabase = createClient()
  const rows = ACTIVITIES.map((a) => ({
    organization_id: organizationId,
    user_id: userId,
    week_start_date: weekKey,
    activity_key: a.key,
    ...cellsToCounts(grid[a.key] ?? []),
    updated_by: userId,
  }))
  const { error } = await supabase
    .from('weekly_activity_entries')
    .upsert(rows, { onConflict: 'organization_id,user_id,week_start_date,activity_key' })
  if (error) throw new Error(error.message)
}

/** First-load reconcile for the CURRENT week (approved policy):
 *  backend rows exist → they win (returned so the grid mirrors them to
 *  localStorage); backend empty but this browser has values → auto-upload
 *  the current week; neither → nothing to do. */
export async function reconcileCurrentWeek(
  organizationId: string, userId: string, localGrid: ManualGrid,
): Promise<{ grid: ManualGrid; source: 'backend' | 'uploaded-local' | 'empty' }> {
  const weekKey = mondayKey()
  const backend = await fetchWeekGrid(weekKey)
  if (backend) return { grid: backend, source: 'backend' }
  if (gridHasValues(localGrid)) {
    await uploadWeek(organizationId, userId, weekKey, localGrid)
    return { grid: localGrid, source: 'uploaded-local' }
  }
  return { grid: localGrid, source: 'empty' }
}

/** All PAST weeks saved in THIS browser for this user (localStorage scan by
 *  key prefix; the current week and the collapse-preference key excluded;
 *  weeks with no nonzero values skipped). */
export function listLocalPastWeeks(userId: string): { weekKey: string; grid: ManualGrid }[] {
  const prefix = LOCAL_KEYS.greatnessValues(userId, '')
  const current = mondayKey()
  const out: { weekKey: string; grid: ManualGrid }[] = []
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)
      if (!key || !key.startsWith(prefix)) continue
      const weekKey = key.slice(prefix.length)
      // Only real week identities (the collapse key ends in ":collapsed").
      if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || weekKey === current) continue
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const saved = JSON.parse(raw) as ManualGrid
      const grid = emptyGrid()
      for (const a of ACTIVITIES) {
        const row = saved[a.key]
        if (Array.isArray(row)) grid[a.key] = row.slice(0, 5).map((v) => sanitizeCell(String(v ?? '')))
      }
      if (gridHasValues(grid)) out.push({ weekKey, grid })
    }
  } catch { /* no local history readable — nothing to import */ }
  return out.sort((a, b) => a.weekKey.localeCompare(b.weekKey))
}

/** One-time "Import past weeks from this browser": uploads local past weeks
 *  the backend doesn't have yet. Weeks that already exist in the backend are
 *  skipped (backend wins — approved policy). Returns what happened. */
export async function importPastWeeks(
  organizationId: string, userId: string,
): Promise<{ imported: number; skipped: number }> {
  const local = listLocalPastWeeks(userId)
  if (local.length === 0) return { imported: 0, skipped: 0 }
  const supabase = createClient()
  const { data, error } = await supabase
    .from('weekly_activity_entries')
    .select('week_start_date')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  const existing = new Set((data ?? []).map((r: { week_start_date: string }) => r.week_start_date))
  let imported = 0
  let skipped = 0
  for (const { weekKey, grid } of local) {
    if (existing.has(weekKey)) { skipped++; continue }
    await uploadWeek(organizationId, userId, weekKey, grid)
    imported++
  }
  return { imported, skipped }
}
