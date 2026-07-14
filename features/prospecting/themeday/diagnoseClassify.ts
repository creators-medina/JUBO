// ─────────────────────────────────────────────────────────────────────────
// Pure diagnosis classifier for the theme-day roster diagnostic. No server/db
// imports so it's unit-testable. The DATA that feeds this comes from the REAL
// Daily Call Log logic (buildThemeDayData output) — this only labels it.
// ─────────────────────────────────────────────────────────────────────────

export type DiagnosisCode =
  | 'should_appear'
  | 'schedule_override'
  | 'day_off'
  | 'board_not_sourced'
  | 'do_not_contact'
  | 'archived'
  | 'status_inactive'
  | 'child_record'
  | 'past_cap'
  | 'no_match'
  | 'unknown'

export const DIAGNOSIS_LABEL: Record<DiagnosisCode, string> = {
  should_appear: 'Should appear',
  schedule_override: 'Hidden by schedule override',
  day_off: 'Hidden because selected day is off',
  board_not_sourced: 'Hidden because board is not sourced for this day',
  do_not_contact: 'Hidden by do_not_contact',
  archived: 'Hidden because archived',
  status_inactive: 'Hidden because status is not active',
  child_record: 'Hidden because child/sub-record',
  past_cap: 'Hidden because past the 500 cap',
  no_match: 'No matching record found',
  unknown: 'Unknown — needs deeper investigation',
}

export type DiagnosisInput = {
  /** Authoritative: is the record in the REAL day roster (buildThemeDayData items)? */
  inFinalRoster: boolean
  notArchived: boolean
  statusActive: boolean
  topLevel: boolean
  hasDoNotContact: boolean
  /** Is the record's board in the day's effective (schedule-resolved) source set? */
  boardInEffectiveSource: boolean
  effectiveMode: 'playbook' | 'any' | 'off' | 'boards'
  /** Passes all record filters AND board is sourced AND not do_not_contact. */
  qualifiesPreCap: boolean
  /** Rank ≤ 500; null when not applicable. */
  withinCap: boolean | null
}

/**
 * Reason a record does or doesn't appear on the selected theme day. Global
 * record properties (archived/status/child/do-not-contact) are checked before
 * day-specific ones (day-off/board-sourcing/cap). The positive case anchors on
 * the REAL roster membership, so it can never disagree with the Daily Call Log.
 */
export function classifyDiagnosis(c: DiagnosisInput): DiagnosisCode {
  if (c.inFinalRoster) return 'should_appear'
  if (!c.notArchived) return 'archived'
  if (!c.statusActive) return 'status_inactive'
  if (!c.topLevel) return 'child_record'
  if (c.hasDoNotContact) return 'do_not_contact'
  if (c.effectiveMode === 'off') return 'day_off'
  if (!c.boardInEffectiveSource) return c.effectiveMode === 'boards' ? 'schedule_override' : 'board_not_sourced'
  if (c.qualifiesPreCap && c.withinCap === false) return 'past_cap'
  return 'unknown'
}
