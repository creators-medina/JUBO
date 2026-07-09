// ─────────────────────────────────────────────────────────────────────────
// Funded-loan definition — ONE implementation (operator-audit Step 2).
//
// "Funded" app-wide means: a record MOVED INTO a funded/closed/post-closing
// stage on the Closing board, dated by record_movements.created_at. This
// module holds the pure pieces of that definition so the Dashboard KPIs and
// Verified Results read the exact same rules and can never drift again:
//   • which stages count (Closing board + the shared closed-word list)
//   • what counts as an ENTRY (a move into the set from outside it — stage
//     shuffles within the funded set, e.g. funded → post-closing, never
//     re-count)
// records.updated_at is NOT a funded date and must never be used as one.
// Movement history only covers in-app moves since tracking began — callers
// must label that limitation honestly rather than inventing dates.
// ─────────────────────────────────────────────────────────────────────────

import { isClosedGroupName } from './shared'

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

export type MovementRow = {
  record_id: string
  from_group_id: string | null
  to_group_id: string
  created_at: string
}

export type EntryEvent = { recordId: string; at: string }

/** Closing board(s) + their funded/closed/post-closing stage groups. */
export function detectClosingFundedGroups(
  boards: { id: string; name: string }[],
  groups: { id: string; board_id: string; name: string }[],
): { closingBoardIds: Set<string>; fundedGroupIds: Set<string>; fundedStageNames: string[] } {
  const closingBoardIds = new Set(boards.filter((b) => squash(b.name).includes('closing')).map((b) => b.id))
  const fundedGroups = groups.filter((g) => closingBoardIds.has(g.board_id) && isClosedGroupName(g.name))
  return {
    closingBoardIds,
    fundedGroupIds: new Set(fundedGroups.map((g) => g.id)),
    fundedStageNames: [...new Set(fundedGroups.map((g) => g.name))],
  }
}

/** Entry events: movements INTO the set from OUTSIDE it (internal shuffles
 *  within the set never count), dated by movement created_at. */
export function entriesIntoSet(movements: MovementRow[], set: Set<string>): EntryEvent[] {
  return movements
    .filter((m) => set.has(m.to_group_id) && !(m.from_group_id && set.has(m.from_group_id)))
    .map((m) => ({ recordId: m.record_id, at: m.created_at }))
}

/** Distinct record ids with an entry in [start, end) — the windowed count. */
export function distinctEntryIdsInWindow(entries: EntryEvent[], start: Date, end: Date): Set<string> {
  const s = start.getTime()
  const e = end.getTime()
  const ids = new Set<string>()
  for (const entry of entries) {
    const t = new Date(entry.at).getTime()
    if (t >= s && t < e) ids.add(entry.recordId)
  }
  return ids
}
