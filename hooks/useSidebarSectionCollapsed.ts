'use client'

// Collapsed/open state for one sidebar workflow section (Monday-style groups).
// Persisted per-browser in localStorage under an isolated per-section key —
// sections default to OPEN and nothing is written to Supabase.
//
// Implemented over useSyncExternalStore so it's hydration-safe (the server
// snapshot is always "open"; the client snapshot reads localStorage) and so
// toggle/forceOpen stay referentially stable — effects that depend on them
// (active-route force-open) run on route changes only, never re-firing just
// because the user collapsed a section by hand.

import { useCallback, useSyncExternalStore } from 'react'

const KEY_PREFIX = 'jubo-sidebar-collapsed:'

const listeners = new Set<() => void>()
function subscribe(cb: () => void): () => void {
  listeners.add(cb)
  window.addEventListener('storage', cb) // cross-tab sync for free
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}
function notify() { listeners.forEach((cb) => cb()) }

function read(section: string): boolean {
  try {
    return window.localStorage.getItem(KEY_PREFIX + section) === '1'
  } catch {
    return false // storage unavailable (private mode etc.) → stay open
  }
}

export function useSidebarSectionCollapsed(section: string): {
  collapsed: boolean
  toggle: () => void
  forceOpen: () => void
} {
  const collapsed = useSyncExternalStore(
    subscribe,
    () => read(section),
    () => false, // server render: open
  )

  const persist = useCallback((updater: (prev: boolean) => boolean) => {
    try {
      const next = updater(read(section))
      if (next) window.localStorage.setItem(KEY_PREFIX + section, '1')
      else window.localStorage.removeItem(KEY_PREFIX + section)
    } catch { /* storage unavailable → state simply doesn't persist */ }
    notify()
  }, [section])

  const toggle = useCallback(() => persist((p) => !p), [persist])
  const forceOpen = useCallback(() => persist(() => false), [persist])

  return { collapsed, toggle, forceOpen }
}
