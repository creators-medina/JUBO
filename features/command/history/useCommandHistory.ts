'use client'

import { useCallback, useEffect, useState } from 'react'
import type { CommandHistoryEntry } from '../types'

// Tracks executed commands (not search navigations) so the palette can surface
// "Frequent" / "Recent" commands and apply a ranking boost. localStorage-backed;
// dedup by commandId with frequency + recency retained.

const STORAGE_KEY = 'jubo.command.history.v1'
const MAX_ENTRIES = 40

function load(): CommandHistoryEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as CommandHistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function save(entries: CommandHistoryEntry[]): void {
  if (typeof window === 'undefined') return
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)) } catch {}
}

export function recordCommandExecution(entry: Omit<CommandHistoryEntry, 'executedAt' | 'count'>): void {
  const list = load()
  const existing = list.find(e => e.commandId === entry.commandId)
  const next = existing
    ? list.map(e => e.commandId === entry.commandId
        ? { ...e, executedAt: Date.now(), count: e.count + 1, title: entry.title, iconName: entry.iconName }
        : e)
    : [{ ...entry, executedAt: Date.now(), count: 1 }, ...list]
  next.sort((a, b) => b.executedAt - a.executedAt)
  save(next.slice(0, MAX_ENTRIES))
  try {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY }))
  } catch {}
}

export function useCommandHistory() {
  const [entries, setEntries] = useState<CommandHistoryEntry[]>([])

  useEffect(() => {
    setEntries(load())
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === STORAGE_KEY) setEntries(load()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  /** Frequency-weighted recent commands, most useful first. */
  const topCommands = useCallback((limit = 4): CommandHistoryEntry[] => {
    return [...entries]
      .sort((a, b) => (b.count * 1000 + b.executedAt / 1e10) - (a.count * 1000 + a.executedAt / 1e10))
      .slice(0, limit)
  }, [entries])

  return { entries, topCommands }
}
