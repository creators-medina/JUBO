'use client'

// Loan-file Overview layout preferences (Phase D7) — card order + per-card
// size, persisted per-browser in localStorage ONLY (no schema, nothing written
// to Supabase; a per-user backend layout is a future phase). The stored order
// is reconciled against the current default set on load: unknown card keys are
// dropped and newly-added cards are appended, so shipping a new card never
// breaks a saved layout. Safe under SSR via a window guard (the modal is
// client-only anyway).

import { useCallback, useState } from 'react'

export type CardSize = 'compact' | 'normal' | 'tall'
export const CARD_SIZES: CardSize[] = ['compact', 'normal', 'tall']

type OverviewLayout = { order: string[]; sizes: Record<string, CardSize> }

const KEY = 'jubo-loanfile-overview:v1'

function load(defaultOrder: string[]): OverviewLayout {
  try {
    if (typeof window === 'undefined') return { order: defaultOrder, sizes: {} }
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { order: defaultOrder, sizes: {} }
    const parsed = JSON.parse(raw) as Partial<OverviewLayout>
    const stored = Array.isArray(parsed.order) ? parsed.order.filter((k) => defaultOrder.includes(k)) : []
    const missing = defaultOrder.filter((k) => !stored.includes(k))
    const sizes: Record<string, CardSize> = {}
    for (const [k, v] of Object.entries(parsed.sizes ?? {})) {
      if (defaultOrder.includes(k) && CARD_SIZES.includes(v as CardSize)) sizes[k] = v as CardSize
    }
    return { order: [...stored, ...missing], sizes }
  } catch {
    return { order: defaultOrder, sizes: {} }
  }
}

export function useOverviewLayout(defaultOrder: string[]) {
  const [layout, setLayout] = useState<OverviewLayout>(() => load(defaultOrder))

  const persist = useCallback((next: OverviewLayout) => {
    setLayout(next)
    try { window.localStorage.setItem(KEY, JSON.stringify(next)) } catch { /* session-only fallback */ }
  }, [])

  /** Reorder: drop `draggedKey` just before/after `targetKey` (sidebar semantics —
   *  dropping downward lands after the target, upward lands before it). */
  const moveCard = useCallback((draggedKey: string, targetKey: string) => {
    if (draggedKey === targetKey) return
    const from = layout.order.indexOf(draggedKey)
    const to = layout.order.indexOf(targetKey)
    if (from < 0 || to < 0) return
    const next = layout.order.filter((k) => k !== draggedKey)
    const targetIdx = next.indexOf(targetKey)
    next.splice(from < to ? targetIdx + 1 : targetIdx, 0, draggedKey)
    persist({ ...layout, order: next })
  }, [layout, persist])

  /** Cycle a card's size: compact → normal → tall → compact. */
  const cycleSize = useCallback((key: string) => {
    const cur = layout.sizes[key] ?? 'normal'
    const next = CARD_SIZES[(CARD_SIZES.indexOf(cur) + 1) % CARD_SIZES.length]
    persist({ ...layout, sizes: { ...layout.sizes, [key]: next } })
  }, [layout, persist])

  const reset = useCallback(() => {
    setLayout({ order: defaultOrder, sizes: {} })
    try { window.localStorage.removeItem(KEY) } catch { /* ignore */ }
  }, [defaultOrder])

  const customized =
    layout.order.join('|') !== defaultOrder.join('|') || Object.keys(layout.sizes).length > 0

  return {
    order: layout.order,
    sizeOf: (key: string): CardSize => layout.sizes[key] ?? 'normal',
    moveCard,
    cycleSize,
    reset,
    customized,
  }
}
