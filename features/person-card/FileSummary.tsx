'use client'

// ─────────────────────────────────────────────────────────────────────────
// FileSummary (Phase D5/D6) — the high-fidelity Loan File summary layer,
// matching the Contact Card reference:
//   • deriveLoanMetrics — ONE read-only pass over the already-loaded loan
//     bundle (fields + field_values); direct slug reads plus two display-only
//     derivations (LTV uses the exact formula the Loan & Property tab shows;
//     DTI = (ΣPITI + monthly liabilities) ÷ monthly income).
//   • LoanSummaryStrip — the warm cream 8-metric band under the navy header
//     (Loan Amount · LTV · FICO · Rate · DSCR · LTC · Est. Closing · Type).
//   • FileSnapshotPanel — the 236px left rail: loan hero, facts list (stage
//     pill · next step · property value · conditions · tasks), property block,
//     and contacts (borrower + loan officer with avatars).
//   • SnapshotCard / SnapRow / MetricCell — reusable compact primitives.
// Everything renders real stored values or an honest "—". DSCR and LTC have
// NO source in the current schema — they render "—" by design (reported as a
// gap; adding them is a separate backend/field phase). Nothing here writes.
// ─────────────────────────────────────────────────────────────────────────

import { numberValue, textValue, dateValue, formatCurrency, formatDate, loanAmountValue } from '@/features/mortgage/data'
import type { LoanCommandData } from './actions'
import { cn } from '@/lib/utils'

// All loan-file metrics the summary layer shows, resolved once per render.
export type LoanMetrics = {
  loanAmount: string | null
  appraisedValue: string | null
  propertyValue: string | null
  ltv: string | null          // derived: loan_amount ÷ appraised_value (same as Loan tab)
  fico: string | null
  rate: string | null
  dscr: string | null         // no source in schema — always null (honest gap)
  ltc: string | null          // no source in schema — always null (honest gap)
  closing: string | null
  loanType: string | null
  purpose: string | null
  address: string | null
  cityState: string | null
  propertyType: string | null
  occupancy: string | null
  income: string | null
  assets: string | null
  liabilities: string | null
  dti: string | null          // derived: (ΣPITI + monthly liabilities) ÷ income
  totalPiti: string | null
  lock: string | null
  rateLock: string | null     // lock expiration date (else status) for Key Dates
  stage: string | null
  ownerName: string | null
}

const PITI_SLUGS = [
  'piti_first_mortgage', 'piti_other_financing', 'piti_hoi', 'piti_supplemental',
  'piti_property_taxes', 'piti_mi', 'piti_association_dues', 'piti_other',
]

const pct = (n: number | null) => (n == null ? null : `${n.toFixed(2)}%`)

/** Resolve every summary metric from the already-loaded loan bundle. Pure and
 *  read-only: direct slug reads + two clearly-labeled display derivations. */
export function deriveLoanMetrics(loan: LoanCommandData): LoanMetrics {
  const n = (slug: string) => numberValue(loan, slug)
  const t = (slug: string) => textValue(loan, slug)

  const base = loanAmountValue(loan)
  const appraised = n('appraised_value')
  // LTV — the same live derivation the Loan & Property tab displays.
  const ltv = appraised && appraised > 0 && base != null ? (base / appraised) * 100 : null

  const pitiVals = PITI_SLUGS.map(n)
  const hasPiti = pitiVals.some((v) => v != null)
  const totalPiti = hasPiti ? pitiVals.reduce((s: number, v) => s + (v ?? 0), 0) : null

  const income = n('monthly_income')
  const liabilities = n('monthly_liabilities')
  // DTI (back-end) — housing payment + monthly liabilities over monthly income.
  const dti = income && income > 0 && totalPiti != null
    ? ((totalPiti + (liabilities ?? 0)) / income) * 100
    : null

  const rate = n('note_rate')
  const fico = n('credit_score')
  const lockExp = dateValue(loan, 'lock_expiration')
  const lockBits = [t('lock_status'), lockExp ? formatDate(lockExp) : null].filter(Boolean)

  const groups = (loan.groups ?? []) as { id: string; name: string }[]
  const stage = groups.find((g) => g.id === (loan.record as { group_id?: string | null }).group_id)?.name ?? null
  const ownerId = (loan.record as { owner_user_id?: string | null }).owner_user_id
  const ownerName = (ownerId && loan.profiles?.[ownerId]) || null

  return {
    loanAmount: base != null ? formatCurrency(base) : null,
    appraisedValue: appraised != null ? formatCurrency(appraised) : null,
    propertyValue: n('property_value') != null ? formatCurrency(n('property_value')) : null,
    ltv: pct(ltv),
    fico: fico != null ? String(Math.round(fico)) : null,
    rate: rate != null ? `${rate}%` : null,
    dscr: null, // no DSCR source in the current field schema
    ltc: null,  // no LTC source in the current field schema
    closing: dateValue(loan, 'target_close_date') ? formatDate(dateValue(loan, 'target_close_date')) : null,
    loanType: t('mortgage_type'),
    purpose: t('loan_purpose'),
    address: t('property_address'),
    cityState: [t('property_city'), t('property_state')].filter(Boolean).join(', ') || null,
    propertyType: t('property_type'),
    occupancy: t('occupancy'),
    income: income != null ? formatCurrency(income) : null,
    assets: n('total_assets') != null ? formatCurrency(n('total_assets')) : null,
    liabilities: liabilities != null ? formatCurrency(liabilities) : null,
    dti: pct(dti),
    totalPiti: totalPiti != null ? formatCurrency(totalPiti) : null,
    lock: lockBits.length > 0 ? lockBits.join(' · ') : null,
    rateLock: lockExp ? formatDate(lockExp) : (t('lock_status') || null),
    stage,
    ownerName,
  }
}

/** Up to two initials for the avatar chips. */
export function nameInitials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** One strip metric: tiny gold uppercase label over a bold navy value.
 *  `compact` (Contact Card 2.0) tightens padding/type — same fields. */
export function SummaryMetric({ label, value, strong, compact }: { label: string; value: string | null; strong?: boolean; compact?: boolean }) {
  const has = value != null && value !== ''
  return (
    <div className={cn('min-w-0 first:pl-1 last:pr-1', compact ? 'px-2.5' : 'px-4')}>
      <p className={cn('font-semibold uppercase text-jubo-gold', compact ? 'text-[8px] tracking-[0.1em]' : 'text-[9px] tracking-[0.12em]')}>{label}</p>
      <p className={cn(
        'truncate tabular-nums',
        strong ? (compact ? 'text-sm font-bold' : 'text-base font-bold') : (compact ? 'text-xs font-semibold' : 'text-sm font-semibold'),
        has ? 'text-jubo-navy' : 'text-jubo-muted/50',
      )}>
        {has ? value : '—'}
      </p>
    </div>
  )
}

/** The warm cream 8-metric band under the navy header (reference: full-width
 *  row, thin dividers, Loan Amount first and dominant). Real values or "—".
 *  `compact` is the 2.0 density variant — identical fields and fallbacks. */
export function LoanSummaryStrip({ m, compact }: { m: LoanMetrics; compact?: boolean }) {
  return (
    <div className={cn(
      'flex items-center divide-x divide-jubo-border overflow-x-auto rounded-lg border border-jubo-border-strong/60 bg-jubo-card-soft/70 shadow-sm',
      compact ? 'px-1.5 py-1' : 'px-2 py-2',
    )}>
      <SummaryMetric label="Loan Amount" value={m.loanAmount} strong compact={compact} />
      <SummaryMetric label="LTV" value={m.ltv} compact={compact} />
      <SummaryMetric label="FICO" value={m.fico} compact={compact} />
      <SummaryMetric label="Rate" value={m.rate} compact={compact} />
      <SummaryMetric label="DSCR" value={m.dscr} compact={compact} />
      <SummaryMetric label="LTC" value={m.ltc} compact={compact} />
      <SummaryMetric label="Est. Closing" value={m.closing} compact={compact} />
      <SummaryMetric label="Loan Type" value={m.loanType ?? m.purpose} compact={compact} />
    </div>
  )
}

/** Compact cream snapshot card with a muted-gold section label and an optional
 *  right-aligned badge (e.g. "4 OPEN"). */
export function SnapshotCard({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <div className="jubo-los-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="jubo-los-section-label">{title}</p>
        {badge && (
          <span className="rounded bg-jubo-gold-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-jubo-gold">{badge}</span>
        )}
      </div>
      {children}
    </div>
  )
}

/** Label→value row used inside snapshot cards and the rail. */
export function SnapRow({ label, value, accent }: { label: string; value: string | null; accent?: React.ReactNode }) {
  const has = value != null && value !== ''
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="flex-shrink-0 text-jubo-muted">{label}</span>
      {accent ?? (
        <span className={cn('truncate text-right font-medium tabular-nums', has ? 'text-jubo-text' : 'text-jubo-muted/50')}>
          {has ? value : '—'}
        </span>
      )}
    </div>
  )
}

/** Two-column label-over-value cell (Financial card in the reference). */
export function MetricCell({ label, value }: { label: string; value: string | null }) {
  const has = value != null && value !== ''
  return (
    <div className="min-w-0">
      <p className="text-2xs text-jubo-muted">{label}</p>
      <p className={cn('truncate text-sm font-semibold tabular-nums', has ? 'text-jubo-text' : 'text-jubo-muted/40')}>
        {has ? value : '—'}
      </p>
    </div>
  )
}

// Loan-officer avatar blue from the reference palette.
const LO_BLUE = '#3f83c4'

/** The persistent 236px left rail — loan hero, facts list, property block, and
 *  contacts, matching the reference. All real data; nothing invented. */
export function FileSnapshotPanel({
  m, borrowerName, phone, nextStep, openConditions, openTasks,
}: {
  m: LoanMetrics
  borrowerName: string
  phone: string | null
  nextStep: string | null
  openConditions: number
  openTasks: number
}) {
  return (
    <aside className="jubo-los-card space-y-3 self-start border-jubo-border-strong/60 p-3.5 shadow-sm">
      {/* Loan hero */}
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-jubo-gold">Loan Amount</p>
        <p className={cn('text-[27px] font-bold leading-tight tracking-tight tabular-nums', m.loanAmount ? 'text-jubo-navy' : 'text-jubo-muted/40')}>
          {m.loanAmount ?? '—'}
        </p>
        {(m.loanType || m.purpose) && (
          <p className="text-2xs text-jubo-muted">{[m.loanType, m.purpose].filter(Boolean).join(' · ')}</p>
        )}
      </div>

      <Rule />

      {/* Facts list — no icons; stage as a coral pill (reference). */}
      <div className="space-y-1">
        <SnapRow
          label="Stage"
          value={m.stage}
          accent={m.stage ? (
            <span className="truncate rounded bg-jubo-red/10 px-1.5 py-0.5 text-[11px] font-semibold text-jubo-red">{m.stage}</span>
          ) : undefined}
        />
        <SnapRow label="Next step" value={nextStep} />
        {/* Label states WHICH stored value this is: the Property tab's Estimated
            Value (property_value) when present, else the Loan tab's Appraised
            Value — never a casual mix of the two meanings. */}
        <SnapRow
          label={m.propertyValue ? 'Est. property value' : m.appraisedValue ? 'Appraised value' : 'Property value'}
          value={m.propertyValue ?? m.appraisedValue}
        />
        <SnapRow label="Conditions" value={`${openConditions} open`} />
        <SnapRow label="Tasks" value={`${openTasks} open`} />
        {m.lock && <SnapRow label="Rate lock" value={m.lock} />}
      </div>

      <Rule />

      {/* Property block */}
      <div>
        <p className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-jubo-gold">Property</p>
        <div className="space-y-1">
          <SnapRow label="Address" value={m.address} />
          <SnapRow label="City / State" value={m.cityState} />
          <SnapRow
            label={m.propertyValue ? 'Est. value' : m.appraisedValue ? 'Appraised' : 'Value'}
            value={m.propertyValue ?? m.appraisedValue}
          />
          <SnapRow label="Type" value={m.propertyType} />
        </div>
      </div>

      <Rule />

      {/* Contacts — borrower + loan officer, once, with avatar chips. */}
      <div>
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-jubo-gold">Contacts</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-jubo-red text-[10px] font-bold text-white">
              {nameInitials(borrowerName)}
            </span>
            <div className="min-w-0 text-xs leading-tight">
              <p className="truncate font-semibold text-jubo-text">{borrowerName}</p>
              <p className="truncate text-2xs text-jubo-muted">Borrower{phone ? ` · ${phone}` : ''}</p>
            </div>
          </div>
          {m.ownerName && (
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white" style={{ background: LO_BLUE }}>
                {nameInitials(m.ownerName)}
              </span>
              <div className="min-w-0 text-xs leading-tight">
                <p className="truncate font-semibold text-jubo-text">{m.ownerName}</p>
                <p className="truncate text-2xs text-jubo-muted">Loan Officer</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

function Rule() {
  return <div className="h-px bg-jubo-border/70" aria-hidden />
}
