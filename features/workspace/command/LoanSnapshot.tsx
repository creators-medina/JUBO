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
import { cn } from '@/lib/utils'
import { textValue, numberValue, dateValue, formatCurrency, formatDate, loanAmountValue } from '@/features/mortgage/data'
import type { MortgageData } from '@/features/mortgage/types'

function pct(data: MortgageData, slug: string): string | null {
  const n = numberValue(data, slug)
  if (n != null) return `${n}%`
  const t = textValue(data, slug)
  return t || null
}

type Tile = { label: string; value: string }

export function LoanSnapshot({ data }: { data: MortgageData }) {
  const amount = loanAmountValue(data)
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
    <section className="jubo-los-card p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <Landmark className="h-3.5 w-3.5 text-jubo-red" />
        <p className="jubo-los-section-label">Loan</p>
      </div>

      {amount != null && (
        <p className="text-3xl font-bold leading-none tracking-tight tabular-nums text-jubo-text">{formatCurrency(amount)}</p>
      )}
      {meta && <p className="mt-1.5 text-xs text-jubo-text-soft">{meta}</p>}

      {tiles.length > 0 && (
        <div className="mt-3 grid grid-cols-2 overflow-hidden rounded-lg border border-jubo-border">
          {tiles.map((t, i) => (
            <div
              key={t.label}
              className={cn(
                'bg-jubo-card-soft px-3 py-2',
                i % 2 === 0 && 'border-r border-jubo-border',
                i >= 2 && 'border-t border-jubo-border',
              )}
            >
              <p className="text-2xs font-medium uppercase tracking-wider text-jubo-muted">{t.label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-jubo-text">{t.value}</p>
            </div>
          ))}
        </div>
      )}

      {footer && (
        <div className="mt-3 flex items-center gap-1.5 border-t border-jubo-border pt-2.5 text-2xs text-jubo-text-soft">
          <Lock className="h-3 w-3 flex-shrink-0" style={{ color: lock ? 'var(--jubo-green)' : undefined }} />
          <span className="truncate">{footer}</span>
        </div>
      )}
    </section>
  )
}
