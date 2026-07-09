// ─────────────────────────────────────────────────────────────────────────
// Shared metric building blocks (operator-audit quick win #4).
//
// ONE home for the primitives that were duplicated across the Dashboard
// overview, the Verified Results aggregation, the theme-day queues, and
// the manual tracker — so definitions can never silently drift apart:
//   • the funded/closed stage-name convention
//   • Monday-start week / period boundaries (local time)
//
// Pure functions only (no data access, no React) — safe to import from
// both server modules and 'use client' components. Consolidation is
// behavior-identical dedupe: every helper reproduces the exact output of
// the local copy it replaced.
// ─────────────────────────────────────────────────────────────────────────

/** The app's single definition of "this stage means the loan is done". */
export const CLOSED_GROUP_WORDS = ['funded', 'closed', 'post closing', 'post-closing'] as const

export function isClosedGroupName(name: string | null | undefined): boolean {
  if (!name) return false
  const n = name.toLowerCase()
  return CLOSED_GROUP_WORDS.some((w) => n.includes(w))
}

/** The app's single "active pipeline" population rule (Step 4): a record
 *  counts toward pipeline money/count totals only while it is an ACTIVE
 *  record sitting in an OPEN (non-funded/closed) stage. Used by the
 *  Dashboard's Active pipeline and the sidebar's Work Loans Pipeline card
 *  so the two totals can never disagree. */
export function isOpenPipelineRecord(
  status: string | null | undefined,
  groupName: string | null | undefined,
): boolean {
  return status === 'active' && !isClosedGroupName(groupName)
}

/** Local midnight of the given date (new Date; input untouched). */
export function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

/** This date's Monday at local midnight (weeks are Monday-start app-wide;
 *  Sunday belongs to the week that STARTED the previous Monday). */
export function mondayOf(d: Date): Date {
  const x = startOfDay(d)
  const dow = x.getDay()
  x.setDate(x.getDate() - (dow === 0 ? 6 : dow - 1))
  return x
}

export function startOfMonthOf(d: Date): Date {
  const x = startOfDay(d)
  x.setDate(1)
  return x
}

export function startOfQuarterOf(d: Date): Date {
  const x = startOfDay(d)
  x.setMonth(Math.floor(x.getMonth() / 3) * 3, 1)
  return x
}

export function startOfYearOf(d: Date): Date {
  const x = startOfDay(d)
  x.setMonth(0, 1)
  return x
}

/** This week's Monday as a local YYYY-MM-DD string — the manual tracker's
 *  week identity (matches the original mondayKey output exactly). */
export function mondayKeyOf(d: Date): string {
  const m = mondayOf(d)
  return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`
}
