'use client'

import { useCallback, useEffect, useState } from 'react'
import type { RecentItem, RecentItemKind } from '../types'

// Operational "recents" — a tiny localStorage-backed MRU list.
// Records open via the workspace, boards/dashboards/goals via direct route
// navigation. Bounded to MAX_RECENTS so it never bloats; latest wins on dedup.

const STORAGE_KEY = 'jubo.command.recents.v1'
const MAX_RECENTS = 50

function loadFromStorage(): RecentItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as RecentItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function saveToStorage(items: RecentItem[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch {}
}

export function useRecentItems() {
  const [items, setItems] = useState<RecentItem[]>([])

  // Hydrate once on mount
  useEffect(() => { setItems(loadFromStorage()) }, [])

  const push = useCallback((entry: Omit<RecentItem, 'openedAt'>) => {
    setItems(prev => {
      const filtered = prev.filter(p => !(p.kind === entry.kind && p.id === entry.id))
      const next = [{ ...entry, openedAt: Date.now() }, ...filtered].slice(0, MAX_RECENTS)
      saveToStorage(next)
      return next
    })
  }, [])

  const remove = useCallback((kind: RecentItemKind, id: string) => {
    setItems(prev => {
      const next = prev.filter(p => !(p.kind === kind && p.id === id))
      saveToStorage(next)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    saveToStorage([])
    setItems([])
  }, [])

  const byKind = useCallback((kind: RecentItemKind, limit = 8): RecentItem[] => {
    return items.filter(i => i.kind === kind).slice(0, limit)
  }, [items])

  return { items, push, remove, clear, byKind }
}

// ── Module-level helpers (imperative push from anywhere) ────────────────────
//
// Some places (record opens, board navigations) live outside a hook. Provide
// imperative helpers that read+write the same storage shape directly so the
// rest of the app doesn't need to thread the hook everywhere.

export function pushRecentItem(entry: Omit<RecentItem, 'openedAt'>): void {
  if (typeof window === 'undefined') return
  const list = loadFromStorage()
  const filtered = list.filter(p => !(p.kind === entry.kind && p.id === entry.id))
  const next = [{ ...entry, openedAt: Date.now() }, ...filtered].slice(0, MAX_RECENTS)
  saveToStorage(next)
  // Fire a storage event so other hooks/components can listen if they want
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(next) }))
  } catch {}
}

export function getRecentItems(): RecentItem[] {
  return loadFromStorage()
}
