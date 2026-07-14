// ─────────────────────────────────────────────────────────────────────────
// Theme-day board matchers — PURE, no server/db imports so it's unit-testable
// and importable by provisioning checks. This is the single source of truth for
// which board names satisfy each Daily Call Log weekday; `queues.ts` imports
// these specs (behavior unchanged) and a verification test asserts that a newly
// provisioned template org resolves all five days.
//
//   Mon  Realtor Calls  → Realtors (a "realtor" board)
//   Tue  Status Calls   → Loan In Process + Inactive Loans
//   Wed  Pre-Apps       → Pre-Approved
//   Thu  Past Clients   → Past Clients
//   Fri  VIPs           → VIPs
//
// Matching is by REAL board name, case/punctuation-tolerant (squash to
// lowercase alphanumerics, substring match). Missing boards are reported, never
// faked.
// ─────────────────────────────────────────────────────────────────────────

/** Tuesday distinguishes active files from inactive ones for the "play" text. */
export type ThemeBoardKind = 'default' | 'active' | 'inactive'

export type ThemeBoardSpec = { canonical: string; kind: ThemeBoardKind; match: (squashedName: string) => boolean }

/** Reduce a board name to comparable characters (lowercase alphanumerics). */
export const squashBoardName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export const THEME_WEEKDAYS = [1, 2, 3, 4, 5] as const

// Board matchers per weekday — squashed-name keywords + the canonical names
// reported when nothing matches. Matching is by real board name only.
export const DAY_BOARD_SPECS: Record<number, ThemeBoardSpec[]> = {
  // Monday pulls ONLY Realtor boards (e.g. "Realtors (Top 40)") — partner/
  // referral boards are intentionally excluded per Medina's call rhythm.
  1: [
    { canonical: 'Realtors (Top 40)', kind: 'default', match: (n) => n.includes('realtor') },
  ],
  2: [
    { canonical: 'Loan In Process', kind: 'active', match: (n) => n.includes('inprocess') },
    { canonical: 'Inactive Loans', kind: 'inactive', match: (n) => n.includes('inactive') },
  ],
  3: [{ canonical: 'Pre-Approved', kind: 'default', match: (n) => n.includes('preapp') }],
  4: [{ canonical: 'Past Clients', kind: 'default', match: (n) => n.includes('pastclient') }],
  5: [{ canonical: 'VIPs', kind: 'default', match: (n) => n.includes('vip') }],
}

export type ThemeDayResolution = { matched: string[]; missing: string[] }

/**
 * Pure resolver: given a set of board names (e.g. an org's boards, or a
 * provisioning template's board names), return which source boards each weekday
 * matched and which canonical sources are missing. Mirrors exactly the matching
 * `buildThemeDayData` performs. Used by the provisioning verification test.
 */
export function resolveThemeDaySources(boardNames: string[]): Record<number, ThemeDayResolution> {
  const squashed = boardNames.map((n) => ({ name: n, sq: squashBoardName(n) }))
  const out: Record<number, ThemeDayResolution> = {}
  for (const weekday of THEME_WEEKDAYS) {
    const matched: string[] = []
    const missing: string[] = []
    for (const spec of DAY_BOARD_SPECS[weekday]) {
      const hits = squashed.filter((b) => spec.match(b.sq)).map((b) => b.name)
      if (hits.length === 0) missing.push(spec.canonical)
      for (const h of hits) if (!matched.includes(h)) matched.push(h)
    }
    out[weekday] = { matched, missing }
  }
  return out
}
