'use client'

import { searchRecords } from './searchRecords'
import { searchBoards } from './searchBoards'
import { searchDashboards } from './searchDashboards'
import { searchGoals } from './searchGoals'
import { searchSavedViews } from './searchSavedViews'
import { searchTasks } from './searchTasks'
import { rankItems } from '../ranking/score'
import type { CommandItem, SearchContext, SearchProvider } from '../types'

// Order matters for the empty-query fallback: providers earlier in the list
// show first when nothing's typed. Once a query exists, ranking does the work.
const PROVIDERS: SearchProvider[] = [
  searchRecords,
  searchBoards,
  searchDashboards,
  searchSavedViews,
  searchGoals,
  searchTasks,
]

/**
 * Fan out across every provider, then merge + rank. Failures are isolated —
 * a single provider erroring shouldn't kill the whole palette.
 */
export async function runGlobalSearch(ctx: SearchContext): Promise<CommandItem[]> {
  const results = await Promise.allSettled(PROVIDERS.map(p => p(ctx)))
  const items: CommandItem[] = []
  for (const r of results) if (r.status === 'fulfilled') items.push(...r.value)
  return rankItems(items, ctx)
}

export { searchRecords, searchBoards, searchDashboards, searchGoals, searchSavedViews, searchTasks }
