'use client'

import { useEffect, useRef, useState } from 'react'
import { runGlobalSearch } from '../search'
import type { CommandItem, SearchContext } from '../types'

const DEBOUNCE_MS = 140

/**
 * Debounced search hook. Re-runs the unified provider chain when query (or
 * any context piece) changes; cancels in-flight responses if a newer query
 * supersedes them so flicker is avoided.
 */
export function useGlobalSearch(ctx: SearchContext) {
  const [items, setItems] = useState<CommandItem[]>([])
  const [loading, setLoading] = useState(false)
  const inflight = useRef(0)

  // Stringify context so React can compare it — ctx is rebuilt every render
  const key = `${ctx.organizationId}|${ctx.query}|${ctx.openRecordIds.join(',')}|${ctx.recentRecordIds.join(',')}`

  useEffect(() => {
    if (!ctx.organizationId) { setItems([]); return }
    const myToken = ++inflight.current
    setLoading(true)

    const timer = setTimeout(async () => {
      try {
        const results = await runGlobalSearch(ctx)
        if (myToken !== inflight.current) return    // stale
        setItems(results)
      } finally {
        if (myToken === inflight.current) setLoading(false)
      }
    }, DEBOUNCE_MS)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { items, loading }
}
