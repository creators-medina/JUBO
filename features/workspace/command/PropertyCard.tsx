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
    <section className="jubo-los-card p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <MapPin className="h-3.5 w-3.5 text-jubo-gold" />
        <p className="jubo-los-section-label">Property</p>
      </div>
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-jubo-gold-soft text-jubo-gold" aria-hidden>
          <MapPin className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          {address && <p className="text-sm font-medium text-jubo-text">{address}</p>}
          {cityState && <p className="mt-0.5 text-2xs text-jubo-text-soft">{cityState}</p>}
          {sub && <p className="mt-1 text-2xs text-jubo-text-soft">{sub}</p>}
        </div>
      </div>
    </section>
  )
}
