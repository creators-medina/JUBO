'use client'

// Placement preference for a pseudo sidebar item (e.g. the "All Boards" link,
// which is a static route — NOT a board record — and so lives outside the
// boards.position reorder model). Stores an opaque placement string the caller
// parses/validates (e.g. "workloans:3"). Mirrors the useSidebarSectionCollapsed
// / useSidebarSectionLabel conventions: persisted per-browser in localStorage,
// hydration-safe via useSyncExternalStore (server snapshot = default), with
// cross-tab sync. Nothing is written to Supabase; org-wide placement would
// need a backend settings phase.

import { useCallback, useSyncExternalStore } from 'react'

const KEY_PREFIX = 'jubo-sidebar-slot:'

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

function read(item: string): string | null {
  try {
    return window.localStorage.getItem(KEY_PREFIX + item)
  } catch {
    return null
  }
}

export function useSidebarSlot(item: string, defaultSlot: string): {
  slot: string
  setSlot: (next: string) => void
} {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(item),
    () => null, // server render: default slot
  )

  const setSlot = useCallback((next: string) => {
    try {
      if (next === defaultSlot) window.localStorage.removeItem(KEY_PREFIX + item)
      else window.localStorage.setItem(KEY_PREFIX + item, next)
    } catch { /* storage unavailable → placement simply doesn't persist */ }
    notify()
  }, [item, defaultSlot])

  return { slot: stored ?? defaultSlot, setSlot }
}
