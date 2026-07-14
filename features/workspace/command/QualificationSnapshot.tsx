'use client'

// ─────────────────────────────────────────────────────────────────────────
// QualificationSnapshot (Command Center · Phase 6) — a KPI-style snapshot band
// on the workspace Overview. Reads existing field values BY SLUG via the
// mortgage data helpers (which return null for absent fields), so every tile
// collapses cleanly when its value is missing — no blanks, no schema work.
//
// Variants by template:
//   loan / lead   → "Qualification"        (loan amount, purpose, type, credit, …)
//   past_client   → "Refi / Equity Snapshot" (closed date, amount, rate, refi)
//   partner       → "Production Snapshot"   (brokerage, referrals YTD, stage)
//   generic       → collapses entirely
//
// Pure presentation/composition. No queries, no new fields, no field/workflow/
// automation/permission/schema changes.
// ─────────────────────────────────────────────────────────────────────────

import { Gauge, RefreshCcw, TrendingUp } from 'lucide-react'
import {
  textValue, numberValue, dateValue, rawValue, formatCurrency, formatDate, currentGroupName, loanAmountValue,
} from '@/features/mortgage/data'
import { resolveTemplateKey } from '@/features/mortgage/templates/resolve'
import type { MortgageData } from '@/features/mortgage/types'

type Tile = { label: string; value: string; accent?: string }

/** number → "N%"; falls back to a text value; null when neither exists. */
function pct(data: MortgageData, slug: string): string | null {
  const n = numberValue(data, slug)
  if (n != null) return `${n}%`
  const t = textValue(data, slug)
  return t || null
}

function money(data: MortgageData, slug: string): string | null {
  const n = numberValue(data, slug)
  return n != null ? formatCurrency(n) : null
}

/** Base loan amount, formatted — precise loan-amount resolution (shared), so
 *  `amount`/`preapproved_amount` fields resolve too. Null → tile is skipped. */
function loanMoney(data: MortgageData): string | null {
  const n = loanAmountValue(data)
  return n != null ? formatCurrency(n) : null
}

function dateTile(data: MortgageData, slug: string): string | null {
  const d = dateValue(data, slug)
  return d ? formatDate(d) : null
}

function buildTiles(data: MortgageData, key: string): { title: string; icon: React.ElementType; accent: string; tiles: Tile[] } | null {
  const push = (tiles: Tile[], label: string, value: string | null, accent?: string) => {
    if (value != null && value !== '' && value !== '—') tiles.push({ label, value, accent })
  }

  if (key === 'loan' || key === 'lead') {
    const tiles: Tile[] = []
    push(tiles, 'Loan Amount', loanMoney(data), 'var(--accent-green)')
    push(tiles, 'Purpose', textValue(data, 'loan_purpose'))
    push(tiles, 'Loan Type', textValue(data, 'loan_type'))
    push(tiles, 'Credit', textValue(data, 'credit_score_range') ?? textValue(data, 'credit_score'))
    push(tiles, 'DTI', pct(data, 'dti'))
    push(tiles, 'LTV', pct(data, 'ltv'))
    push(tiles, 'Occupancy', textValue(data, 'occupancy') ?? textValue(data, 'occupancy_type'))
    push(tiles, 'Target Close', dateTile(data, 'target_close_date'))
    push(tiles, 'Preapproval Exp.', dateTile(data, 'preapproval_expiration'), 'var(--accent-amber)')
    return tiles.length ? { title: 'Qualification', icon: Gauge, accent: 'var(--accent-violet)', tiles } : null
  }

  if (key === 'past_client') {
    const tiles: Tile[] = []
    push(tiles, 'Closed Date', dateTile(data, 'closed_date'))
    push(tiles, 'Loan Amount', loanMoney(data), 'var(--accent-green)')
    push(tiles, 'Current Rate', pct(data, 'current_rate'))
    const refi = textValue(data, 'refi_opportunity')
    if (refi && refi !== 'false' && refi.toLowerCase() !== 'no') push(tiles, 'Refi Opportunity', 'Yes', 'var(--accent-green)')
    return tiles.length ? { title: 'Refi / Equity Snapshot', icon: RefreshCcw, accent: 'var(--accent-rose)', tiles } : null
  }

  if (key === 'partner') {
    const tiles: Tile[] = []
    push(tiles, 'Brokerage', textValue(data, 'brokerage_company'))
    const refs = numberValue(data, 'referrals_ytd')
    push(tiles, 'Referrals YTD', refs != null ? String(refs) : null, refs && refs >= 3 ? 'var(--accent-green)' : undefined)
    push(tiles, 'Stage', currentGroupName(data))
    push(tiles, 'Source', textValue(data, 'referral_source') ?? textValue(data, 'lead_source'))
    return tiles.length ? { title: 'Production Snapshot', icon: TrendingUp, accent: 'var(--accent-cyan)', tiles } : null
  }

  return null // generic → collapse entirely
}

export function QualificationSnapshot({ data }: { data: MortgageData }) {
  const key = resolveTemplateKey(data)
  const built = buildTiles(data, key)
  if (!built) return null
  const { title, icon: Icon, tiles } = built

  return (
    <section className="jubo-los-card p-4">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-jubo-gold" />
        <p className="jubo-los-section-label">{title}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg bg-jubo-card-soft px-3 py-2.5">
            <p className="text-2xs font-medium uppercase tracking-wider text-jubo-muted">{t.label}</p>
            <p
              className="mt-0.5 truncate text-sm font-semibold tabular-nums"
              style={{ color: t.accent ?? 'var(--jubo-text)' }}
            >
              {t.value}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}
