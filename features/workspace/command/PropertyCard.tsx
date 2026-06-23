'use client'

// ─────────────────────────────────────────────────────────────────────────
// PropertyCard (Phase 10.2) — the subject-property summary for the left column.
// Reads existing field values BY SLUG (property_address is a seeded common key;
// city/state/type/value are attempted and collapse when absent). Returns null
// when no property data exists — no invented values, no new fields/schema.
// Presentation only.
// ─────────────────────────────────────────────────────────────────────────

import { MapPin } from 'lucide-react'
import { textValue, numberValue, formatCurrency } from '@/features/mortgage/data'
import type { MortgageData } from '@/features/mortgage/types'

export function PropertyCard({ data }: { data: MortgageData }) {
  const address = textValue(data, 'property_address')
  const city = textValue(data, 'property_city') ?? textValue(data, 'city')
  const state = textValue(data, 'property_state') ?? textValue(data, 'state')
  const type = textValue(data, 'property_type')
  const estNum = numberValue(data, 'estimated_value') ?? numberValue(data, 'property_value')
  const est = estNum != null ? formatCurrency(estNum) : (textValue(data, 'estimated_value') ?? null)

  const cityState = [city, state].filter(Boolean).join(', ')
  const sub = [type, est ? `Est. ${est}` : null].filter(Boolean).join(' · ')

  if (!address && !cityState && !sub) return null

  return (
    <section className="rounded-xl border border-border/60 bg-surface-1/30 p-3.5">
      <div className="mb-2 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Property</p>
      </div>
      {address && <p className="text-sm font-medium text-foreground">{address}</p>}
      {cityState && <p className="mt-0.5 text-2xs text-muted-foreground">{cityState}</p>}
      {sub && <p className="mt-1 text-2xs text-muted-foreground">{sub}</p>}
    </section>
  )
}
