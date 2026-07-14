'use client'

// ─────────────────────────────────────────────────────────────────────────
// Sidebar nav layout — ONE normalized, per-browser layout model for the
// shell's customizable nav (Monday-style): the order of the movable group
// blocks, and which group each nav item lives in (and where within it).
//
// Persisted as a single localStorage JSON (no schema; system links and
// synthetic items never touch backend tables that expect real board IDs).
// Reconciliation is defensive: unknown saved ids are ignored, items missing
// from the saved layout are appended to their DEFAULT group, and clearing
// storage restores the default layout — the sidebar can never crash or
// lose items because of a stale layout.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useMemo, useSyncExternalStore } from 'react'

const KEY = 'jubo-sidebar-nav-layout:v1'

type SavedLayout = { groups?: unknown; items?: Record<string, unknown> }

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
  try { return window.localStorage.getItem(KEY) } catch { return null }
}

export function useSidebarNavLayout(
  /** Movable group blocks in default top-to-bottom order. */
  defaultGroups: readonly string[],
  /** Item-holding groups → default item ids (an item lives in exactly one group). */
  defaultItems: Record<string, readonly string[]>,
): {
  groupOrder: string[]
  itemsFor: (group: string) => string[]
  moveGroup: (draggedKey: string, targetKey: string) => void
  moveItem: (id: string, targetGroup: string, targetIndex: number) => void
} {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null)

  const layout = useMemo(() => {
    let saved: SavedLayout = {}
    try { if (raw) saved = JSON.parse(raw) as SavedLayout } catch { /* defaults */ }

    // Group order: saved order filtered to known groups, missing appended.
    const savedGroups = Array.isArray(saved.groups) ? (saved.groups as unknown[]).filter((g): g is string => typeof g === 'string') : []
    const groupOrder = [
      ...savedGroups.filter((g) => defaultGroups.includes(g)),
      ...defaultGroups.filter((g) => !savedGroups.includes(g)),
    ]

    // Item placement: first saved occurrence wins; unknown ids dropped;
    // unplaced ids appended to their default group in default order.
    const knownIds = new Set(Object.values(defaultItems).flat())
    const itemGroups = Object.keys(defaultItems)
    const placed = new Set<string>()
    const items: Record<string, string[]> = {}
    for (const g of itemGroups) {
      const arr = Array.isArray(saved.items?.[g]) ? (saved.items![g] as unknown[]) : []
      items[g] = arr.filter((id): id is string => typeof id === 'string' && knownIds.has(id) && !placed.has(id))
      items[g].forEach((id) => placed.add(id))
    }
    for (const g of itemGroups) {
      for (const id of defaultItems[g]) if (!placed.has(id)) { items[g].push(id); placed.add(id) }
    }
    return { groupOrder, items }
  }, [raw, defaultGroups, defaultItems])

  const save = useCallback((next: { groupOrder: string[]; items: Record<string, string[]> }) => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify({ groups: next.groupOrder, items: next.items }))
    } catch { /* layout simply doesn't persist */ }
    notify()
  }, [])

  const moveGroup = useCallback((draggedKey: string, targetKey: string) => {
    if (draggedKey === targetKey) return
    const order = [...layout.groupOrder]
    const from = order.indexOf(draggedKey)
    const to = order.indexOf(targetKey)
    if (from < 0 || to < 0) return
    order.splice(from, 1)
    order.splice(from < to ? to : to, 0, draggedKey)
    save({ groupOrder: order, items: layout.items })
  }, [layout, save])

  const moveItem = useCallback((id: string, targetGroup: string, targetIndex: number) => {
    if (!(targetGroup in layout.items)) return
    const items: Record<string, string[]> = {}
    for (const [g, arr] of Object.entries(layout.items)) items[g] = arr.filter((x) => x !== id)
    const idx = Math.max(0, Math.min(targetIndex, items[targetGroup].length))
    items[targetGroup].splice(idx, 0, id)
    save({ groupOrder: layout.groupOrder, items })
  }, [layout, save])

  const itemsFor = useCallback((group: string) => layout.items[group] ?? [], [layout])

  return { groupOrder: layout.groupOrder, itemsFor, moveGroup, moveItem }
}
