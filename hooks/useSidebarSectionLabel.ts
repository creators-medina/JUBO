'use client'

// Custom display label for one sidebar workflow section (e.g. renaming
// "Work Loans"). The section labels are presentation-only strings — there is
// no backing table — so, mirroring useSidebarSectionCollapsed, the override is
// persisted per-browser in localStorage under an isolated per-section key and
// nothing is written to Supabase. Clearing the name (or saving the default)
// removes the override. Hydration-safe via useSyncExternalStore (server
// snapshot = default label) with cross-tab sync for free.

import { useCallback, useSyncExternalStore } from 'react'

const KEY_PREFIX = 'jubo-sidebar-section-label:'

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

function read(section: string): string | null {
  try {
    return window.localStorage.getItem(KEY_PREFIX + section)
  } catch {
    return null // storage unavailable (private mode etc.) → default label
  }
}

export function useSidebarSectionLabel(section: string, defaultLabel: string): {
  label: string
  rename: (next: string) => void
} {
  const stored = useSyncExternalStore(
    subscribe,
    () => read(section),
    () => null, // server render: default label
  )

  const rename = useCallback((next: string) => {
    const v = next.trim()
    try {
      // Empty or back-to-default clears the override rather than storing it.
      if (!v || v === defaultLabel) window.localStorage.removeItem(KEY_PREFIX + section)
      else window.localStorage.setItem(KEY_PREFIX + section, v)
    } catch { /* storage unavailable → label simply doesn't persist */ }
    notify()
  }, [section, defaultLabel])

  return { label: (stored ?? '').trim() || defaultLabel, rename }
}
