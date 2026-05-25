// Lightweight string-matching + scoring helpers used by the command palette.
//
// Intentionally simple: no embeddings, no n-grams. Exact > prefix > contains >
// fuzzy character-walk. Combined with type weights + recency boosts from
// `../types.ts`, it ranks results well enough for an instant-feel palette
// without paying the cost of a full text-search index.

import {
  TYPE_WEIGHT, RECENT_BOOST, OPEN_TAB_BOOST,
  EXACT_MATCH, PREFIX_MATCH, CONTAINS_MATCH, FUZZY_BASE,
} from '../types'
import type { CommandItem, SearchContext } from '../types'

/** Returns 0..1 indicating how cleanly `query` fits within `haystack`. */
export function fuzzyMatchScore(query: string, haystack: string): number {
  if (!query) return 0
  const q = query.toLowerCase()
  const h = haystack.toLowerCase()

  if (h === q) return 1                                  // exact
  if (h.startsWith(q)) return 0.85                       // prefix
  if (h.includes(q)) return 0.6                          // substring

  // Subsequence walk: every char of q must appear in h in order.
  let i = 0
  for (const c of h) {
    if (c === q[i]) i += 1
    if (i === q.length) break
  }
  if (i === q.length) return 0.4 - Math.min(0.3, (h.length - q.length) / 200)

  return 0
}

/** Convert a fuzzy 0..1 score to the palette's weighted scale (0..100). */
export function matchPoints(query: string, candidate: string): number {
  if (!query) return 0
  const q = query.toLowerCase().trim()
  const c = candidate.toLowerCase()
  if (c === q) return EXACT_MATCH
  if (c.startsWith(q)) return PREFIX_MATCH
  if (c.includes(q)) return CONTAINS_MATCH
  const f = fuzzyMatchScore(q, c)
  return f > 0 ? FUZZY_BASE + f * 20 : 0
}

/**
 * Compute the final score for a CommandItem given the search context.
 * Highest contributor across title + keywords wins. Type weight is a
 * baseline so an open workspace tab still ranks above a vague substring.
 */
export function scoreCommandItem(item: CommandItem, ctx: SearchContext): number {
  const baseline = TYPE_WEIGHT[item.type] ?? 0
  const recencyBoost = ctx.recentRecordIds.includes(item.id.replace(/^record:/, '')) ? RECENT_BOOST : 0
  const openBoost = item.type === 'workspace_tab' || ctx.openRecordIds.includes(item.id.replace(/^record:/, ''))
    ? OPEN_TAB_BOOST
    : 0

  if (!ctx.query.trim()) {
    return baseline + recencyBoost + openBoost
  }

  const titlePts = matchPoints(ctx.query, item.title)
  const subPts   = item.subtitle ? matchPoints(ctx.query, item.subtitle) * 0.5 : 0
  const kwPts    = (item.keywords ?? []).reduce((max, k) => Math.max(max, matchPoints(ctx.query, k) * 0.7), 0)
  const matchPts = Math.max(titlePts, subPts, kwPts)

  if (matchPts === 0) return 0   // dropped from results when no match
  return baseline + matchPts + recencyBoost + openBoost
}

/** Score + sort + drop zeros + cap to a sensible visible count. */
export function rankItems(items: CommandItem[], ctx: SearchContext, max = 60): CommandItem[] {
  const scored = items
    .map(item => ({ ...item, score: scoreCommandItem(item, ctx) }))
    .filter(item => item.score! > 0)
  scored.sort((a, b) => b.score! - a.score!)
  return scored.slice(0, max)
}
