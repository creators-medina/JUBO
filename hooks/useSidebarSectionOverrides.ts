'use client'

// Per-browser overrides for which sidebar group a board displays in
// (Generate ↔ Work Loans). The groups are PRESENTATION-ONLY — derived from
// board_type + name — and board_type itself drives real behavior (workspace
// card templates, workflow conditions), so a drag between groups must NOT
// mutate the board row. Instead the choice lives here, in one localStorage
// JSON map, following the same conventions as the other sidebar preferences:
// hydration-safe via useSyncExternalStore (server snapshot = no overrides),
// cross-tab sync, cleared entries fall back to the derived group.

import { useCallback, useMemo, useSyncExternalStore } from 'react'

export type SidebarSectionKey = 'generate' | 'workloans'

const KEY = 'jubo-sidebar-section-overrides:v1'

const listeners = new Set<() => void>()
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}
function notify() { listeners.forEach((cb) => cb()) }

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function parse(raw: string | null): Record<string, SidebarSectionKey> {
  if (!raw) return {}
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, SidebarSectionKey> = {}
    for (const [id, v] of Object.entries(obj)) {
      if (v === 'generate' || v === 'workloans') out[id] = v
    }
    return out
  } catch {
    return {}
  }
}

export function useSidebarSectionOverrides(): {
  overrides: Record<string, SidebarSectionKey>
  /** null clears the override (board returns to its derived group). */
  setOverride: (boardId: string, section: SidebarSectionKey | null) => void
} {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null)
  const overrides = useMemo(() => parse(raw), [raw])

  const setOverride = useCallback((boardId: string, section: SidebarSectionKey | null) => {
    try {
      const next = parse(readRaw())
      if (section === null) delete next[boardId]
      else next[boardId] = section
      if (Object.keys(next).length === 0) window.localStorage.removeItem(KEY)
      else window.localStorage.setItem(KEY, JSON.stringify(next))
    } catch { /* storage unavailable → the move simply doesn't persist */ }
    notify()
  }, [])

  return { overrides, setOverride }
}
