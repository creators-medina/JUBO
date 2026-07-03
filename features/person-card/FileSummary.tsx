'use client'

// ─────────────────────────────────────────────────────────────────────────
// FileSummary (Phase D5) — the ARIVE-style loan file summary layer:
//   • deriveLoanMetrics — ONE read-only pass over the already-loaded loan
//     bundle (fields + field_values); direct slug reads plus two display-only
//     derivations (LTV uses the exact formula the Loan & Property tab shows;
//     DTI = (ΣPITI + monthly liabilities) ÷ monthly income).
//   • LoanSummaryStrip — compact metric chips under the navy header
//     (Loan Amount · LTV · FICO · Rate · DSCR · LTC · Est. Closing · Type).
//   • FileSnapshotPanel — the persistent left "file command center" rail.
//   • SnapshotCard / SummaryMetric — reusable compact display primitives.
// Everything renders real stored values or an honest "—". DSCR and LTC have
// NO source in the current schema — they render "—" by design (reported as a
// gap; adding them is a separate backend/field phase). Nothing here writes.
// ─────────────────────────────────────────────────────────────────────────

import { Home, User, MapPin, ListChecks, Flag, Users } from 'lucide-react'
import { numberValue, textValue, dateValue, formatCurrency, formatDate } from '@/features/mortgage/data'
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

  const base = n('loan_amount')
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
  const lockBits = [t('lock_status'), dateValue(loan, 'lock_expiration') ? formatDate(dateValue(loan, 'lock_expiration')) : null].filter(Boolean)

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
    stage,
    ownerName,
  }
}

/** One compact metric: tiny gold uppercase label over a navy value. */
export function SummaryMetric({ label, value, strong }: { label: string; value: string | null; strong?: boolean }) {
  const has = value != null && value !== ''
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-jubo-gold">{label}</p>
      <p className={cn(
        'truncate tabular-nums',
        strong ? 'text-base font-bold' : 'text-sm font-semibold',
        has ? 'text-jubo-navy' : 'text-jubo-muted/50',
      )}>
        {has ? value : '—'}
      </p>
    </div>
  )
}

/** ARIVE-style top summary strip — one compact row of the numbers a loan
 *  officer asks for first. Missing values show "—"; nothing is fabricated. */
export function LoanSummaryStrip({ m }: { m: LoanMetrics }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-jubo-border bg-jubo-card-soft/70 px-4 py-2.5">
      <SummaryMetric label="Loan Amount" value={m.loanAmount} strong />
      <Divider />
      <SummaryMetric label="LTV" value={m.ltv} />
      <SummaryMetric label="FICO" value={m.fico} />
      <SummaryMetric label="Rate" value={m.rate} />
      <SummaryMetric label="DSCR" value={m.dscr} />
      <SummaryMetric label="LTC" value={m.ltc} />
      <Divider />
      <SummaryMetric label="Est. Closing" value={m.closing} />
      <SummaryMetric label="Loan Type" value={[m.purpose, m.loanType].filter(Boolean).join(' · ') || null} />
    </div>
  )
}

function Divider() {
  return <span className="hidden h-7 w-px bg-jubo-border sm:block" aria-hidden />
}

/** Compact cream snapshot card with a muted-gold section label. */
export function SnapshotCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="jubo-los-card p-3">
      <p className="jubo-los-section-label mb-2">{title}</p>
      {children}
    </div>
  )
}

/** Label→value row used inside snapshot cards. */
export function SnapRow({ label, value }: { label: string; value: string | null }) {
  const has = value != null && value !== ''
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-xs">
      <span className="flex-shrink-0 text-jubo-muted">{label}</span>
      <span className={cn('truncate text-right font-medium tabular-nums', has ? 'text-jubo-text' : 'text-jubo-muted/50')}>
        {has ? value : '—'}
      </span>
    </div>
  )
}

/** The persistent left rail — a file command center: loan, property, borrower
 *  contact, stage, next step, work counts, and the file team. All real data. */
export function FileSnapshotPanel({
  m, borrowerName, phone, email, nextStep, openConditions, openTasks,
}: {
  m: LoanMetrics
  borrowerName: string
  phone: string | null
  email: string | null
  nextStep: string | null
  openConditions: number
  openTasks: number
}) {
  return (
    <aside className="jubo-los-card space-y-3 self-start p-3.5">
      {/* Loan hero — the number the file is about. */}
      <div>
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-jubo-gold">Loan Amount</p>
        <p className={cn('text-2xl font-bold tracking-tight tabular-nums', m.loanAmount ? 'text-jubo-navy' : 'text-jubo-muted/40')}>
          {m.loanAmount ?? '—'}
        </p>
        {(m.purpose || m.loanType || m.rate) && (
          <p className="mt-0.5 text-2xs text-jubo-muted">
            {[m.purpose, m.loanType, m.rate ? `@ ${m.rate}` : null].filter(Boolean).join(' · ')}
          </p>
        )}
        {m.lock && (
          <p className="mt-1 inline-flex rounded-full bg-jubo-gold-soft px-2 py-0.5 text-[10px] font-medium text-jubo-gold">{m.lock}</p>
        )}
      </div>

      <Rule />

      {/* Property */}
      <div className="flex items-start gap-2">
        <Home className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" />
        <div className="min-w-0 text-xs">
          <p className={cn('truncate font-medium', m.address ? 'text-jubo-text' : 'text-jubo-muted/50')}>{m.address ?? '—'}</p>
          {m.cityState && <p className="truncate text-2xs text-jubo-muted">{m.cityState}</p>}
          <p className="text-2xs text-jubo-muted">
            {[m.propertyType, m.occupancy, m.propertyValue ?? m.appraisedValue ? `Val ${m.propertyValue ?? m.appraisedValue}` : null].filter(Boolean).join(' · ') || ''}
          </p>
        </div>
      </div>

      {/* Borrower contact */}
      <div className="flex items-start gap-2">
        <User className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" />
        <div className="min-w-0 text-xs">
          <p className="truncate font-medium text-jubo-text">{borrowerName}</p>
          {phone && <p className="truncate text-2xs tabular-nums text-jubo-muted">{phone}</p>}
          {email && <p className="truncate text-2xs text-jubo-muted">{email}</p>}
          {!phone && !email && <p className="text-2xs text-jubo-muted/50">No contact info</p>}
        </div>
      </div>

      <Rule />

      {/* Stage + next step */}
      <div className="flex items-start gap-2">
        <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" />
        <div className="min-w-0 text-xs">
          <p className={cn('truncate font-medium', m.stage ? 'text-jubo-text' : 'text-jubo-muted/50')}>{m.stage ?? '—'}</p>
          <p className="truncate text-2xs text-jubo-muted">Current stage</p>
        </div>
      </div>
      <div className="flex items-start gap-2">
        <Flag className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" />
        <div className="min-w-0 text-xs">
          <p className={cn('truncate font-medium', nextStep ? 'text-jubo-text' : 'text-jubo-muted/50')}>{nextStep ?? 'No next step set'}</p>
          <p className="truncate text-2xs text-jubo-muted">Next step</p>
        </div>
      </div>

      {/* Work counts */}
      <div className="flex items-center gap-2 text-xs">
        <ListChecks className="h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" />
        <span className="text-jubo-text">
          <span className="font-semibold tabular-nums">{openConditions}</span> open conditions
          <span className="text-jubo-muted"> · </span>
          <span className="font-semibold tabular-nums">{openTasks}</span> tasks
        </span>
      </div>

      <Rule />

      {/* File team */}
      <div className="flex items-start gap-2">
        <Users className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" />
        <div className="min-w-0 text-xs">
          <p className="truncate text-jubo-text">{borrowerName} <span className="text-2xs text-jubo-muted">· Borrower</span></p>
          {m.ownerName && (
            <p className="truncate text-jubo-text">{m.ownerName} <span className="text-2xs text-jubo-muted">· Loan Officer</span></p>
          )}
        </div>
      </div>
    </aside>
  )
}

function Rule() {
  return <div className="h-px bg-jubo-border/70" aria-hidden />
}
