'use client'

// ─────────────────────────────────────────────────────────────────────────
// LoanSnapshot (Phase 10.2) — the reference-styled loan file summary for the
// left column of the Borrower Command Center: a hero loan amount + program/rate/
// purpose meta line, KPI tiles (down / LTV / DTI / credit / occupancy / close),
// and a lock/lender footer. Reads existing field values BY SLUG via the mortgage
// helpers; every value collapses when absent (no empty placeholders). Shown for
// loan/lead records (non-loan entities use QualificationSnapshot's variants).
//
// Presentation only — no queries, no new fields, no schema/engine changes.
// ─────────────────────────────────────────────────────────────────────────

import { Landmark, Lock } from 'lucide-react'
import { textValue, numberValue, dateValue, formatCurrency, formatDate } from '@/features/mortgage/data'
import type { MortgageData } from '@/features/mortgage/types'

const ACCENT = 'var(--accent-violet)'

function pct(data: MortgageData, slug: string): string | null {
  const n = numberValue(data, slug)
  if (n != null) return `${n}%`
  const t = textValue(data, slug)
  return t || null
}

type Tile = { label: string; value: string }

export function LoanSnapshot({ data }: { data: MortgageData }) {
  const amount = numberValue(data, 'loan_amount')
  const loanType = textValue(data, 'loan_type')
  const rate = numberValue(data, 'current_rate')
  const purpose = textValue(data, 'loan_purpose')
  const meta = [loanType, rate != null ? `${rate}%` : null, purpose].filter(Boolean).join(' · ')

  const tiles: Tile[] = []
  const push = (label: string, value: string | null) => {
    if (value != null && value !== '' && value !== '—') tiles.push({ label, value })
  }
  const down = numberValue(data, 'down_payment')
  push('Down', down != null ? formatCurrency(down) : pct(data, 'down_payment_percent'))
  push('LTV', pct(data, 'ltv'))
  push('DTI', pct(data, 'dti'))
  push('Credit', textValue(data, 'credit_score_range') ?? textValue(data, 'credit_score'))
  push('Occupancy', textValue(data, 'occupancy') ?? textValue(data, 'occupancy_type'))
  const close = dateValue(data, 'target_close_date')
  push('Close', close ? formatDate(close) : null)

  const lock = textValue(data, 'lock_status') ?? textValue(data, 'rate_lock')
  const lender = textValue(data, 'lender') ?? textValue(data, 'servicer')
  const footer = [lock, lender].filter(Boolean).join(' · ')

  // Nothing useful → collapse entirely (rare for a real loan file).
  if (amount == null && !meta && tiles.length === 0 && !footer) return null

  return (
    <section className="premium-card relative overflow-hidden rounded-xl p-3.5">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: `linear-gradient(90deg, ${ACCENT}, transparent)` }} />
      <div className="mb-2 flex items-center gap-1.5">
        <Landmark className="h-3.5 w-3.5" style={{ color: ACCENT }} />
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Loan</p>
      </div>

      {amount != null && (
        <p className="text-2xl font-bold leading-none tracking-tight tabular-nums text-foreground">{formatCurrency(amount)}</p>
      )}
      {meta && <p className="mt-1 text-xs text-muted-foreground">{meta}</p>}

      {tiles.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {tiles.map((t) => (
            <div key={t.label} className="rounded-lg bg-surface-1/70 px-3 py-2">
              <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{t.label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {footer && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-border/60 pt-2.5 text-2xs text-muted-foreground">
          <Lock className="h-3 w-3 flex-shrink-0" style={{ color: lock ? 'var(--accent-green)' : undefined }} />
          <span className="truncate">{footer}</span>
        </div>
      )}
    </section>
  )
}
