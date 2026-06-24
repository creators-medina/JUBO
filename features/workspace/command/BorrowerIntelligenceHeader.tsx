'use client'

// ─────────────────────────────────────────────────────────────────────────
// BorrowerIntelligenceHeader (Phase 10.5) — the at-a-glance loan-file summary
// directly beneath the stage tracker. Three stacked bands:
//   1. Identity — name, loan type · purpose, loan amount, + property.
//   2. Health indicators — comm health, loan health, checklist, last contact,
//      target close, next step (read-only echo of the existing next action).
//   3. Quick facts — rate / credit / DTI / LTV / occupancy.
//
// Pure presentation over already-loaded data via existing helpers + metrics +
// opportunity signals. Every field/chip collapses when its value is absent — no
// blanks, no fake placeholders. No queries, no new engines.
// ─────────────────────────────────────────────────────────────────────────

import { MapPin, Zap } from 'lucide-react'
import { textValue, numberValue, dateValue, formatCurrency, formatDate } from '@/features/mortgage/data'
import { isChecklistFieldType, isChecklistChecked } from '@/features/fields/checklist'
import type { MortgageData } from '@/features/mortgage/types'
import type { ContactHealth } from '@/features/communications/types'

function pct(data: MortgageData, slug: string): string | null {
  const n = numberValue(data, slug)
  if (n != null) return `${n}%`
  const t = textValue(data, slug)
  return t || null
}

type Chip = { key: string; label: string; value: string; color: string }
type Fact = { label: string; value: string }

export function BorrowerIntelligenceHeader({
  data, signals, isMortgage, contactHealth, lastContactDays, roleLabel,
}: {
  data: MortgageData
  signals: any[]
  isMortgage: boolean
  contactHealth: ContactHealth
  lastContactDays: number | null
  roleLabel: string
}) {
  // ── Identity ──
  const name = data.record?.title ?? 'Borrower'
  const loanType = textValue(data, 'loan_type')
  const purpose = textValue(data, 'loan_purpose')
  const subtitle = [loanType, purpose].filter(Boolean).join(' · ') || roleLabel
  const amount = numberValue(data, 'loan_amount')

  // ── Property ──
  const address = textValue(data, 'property_address')
  const city = textValue(data, 'property_city') ?? textValue(data, 'city')
  const state = textValue(data, 'property_state') ?? textValue(data, 'state')
  const pType = textValue(data, 'property_type')
  const estNum = numberValue(data, 'estimated_value') ?? numberValue(data, 'property_value')
  const est = estNum != null ? formatCurrency(estNum) : (textValue(data, 'estimated_value') ?? null)
  const cityState = [city, state].filter(Boolean).join(', ')
  const propSub = [pType, est ? `Est. ${est}` : null].filter(Boolean).join(' · ')
  const hasProperty = !!(address || cityState || propSub)

  // ── Health indicators ──
  const chips: Chip[] = []

  // Communication health (reuse existing metric).
  const commHealth = contactHealth === 'healthy' ? { v: 'On track', c: 'var(--accent-green)' }
    : contactHealth === 'warming' ? { v: 'Cooling', c: 'var(--accent-amber)' }
    : contactHealth === 'stale' ? { v: 'At risk', c: 'var(--accent-rose)' }
    : { v: 'No contact', c: 'var(--surface-3)' }
  chips.push({ key: 'comm', label: 'Comm health', value: commHealth.v, color: commHealth.c })

  // Loan health (reuse existing opportunity signals; mortgage only).
  if (isMortgage) {
    const urgent = signals.filter((s) => s.level === 'urgent').length
    const warning = signals.filter((s) => s.level === 'warning').length
    const lh = urgent > 0 ? { v: 'At risk', c: 'var(--accent-rose)' }
      : warning > 0 ? { v: 'Watch', c: 'var(--accent-amber)' }
      : { v: 'On track', c: 'var(--accent-green)' }
    chips.push({ key: 'loan', label: 'Loan health', value: lh.v, color: lh.c })
  }

  // Checklist progress (from loaded fields; no new query).
  const checklistFields = data.fields.filter((f: any) => isChecklistFieldType(f.field_type))
  if (checklistFields.length > 0) {
    const fvByField = new Map<string, any>()
    for (const fv of data.fieldValues) fvByField.set(fv.field_id, fv)
    const total = checklistFields.length
    const done = checklistFields.filter((f: any) => isChecklistChecked(fvByField.get(f.id))).length
    const missing = total - done
    const pctVal = Math.round((done / total) * 100)
    chips.push({
      key: 'checklist', label: 'Checklist',
      value: missing === 0 ? `${pctVal}% · complete` : `${pctVal}% · ${missing} left`,
      color: missing === 0 ? 'var(--accent-green)' : 'var(--accent-amber)',
    })
  }

  // Last contact (reuse existing metric).
  if (lastContactDays != null) {
    chips.push({
      key: 'last', label: 'Last contact',
      value: lastContactDays === 0 ? 'Today' : `${lastContactDays}d ago`,
      color: commHealth.c,
    })
  }

  // Target close.
  const close = dateValue(data, 'target_close_date')
  if (close) chips.push({ key: 'close', label: 'Target close', value: formatDate(close), color: 'var(--accent-cyan)' })

  // Next step (read-only echo; the interactive card lives in the right rail).
  const na = textValue(data, 'next_action') ?? (data.record?.next_action as string | null) ?? null
  const due = data.record?.next_action_due_at as string | null
  const doneNa = data.record?.next_action_completed_at
  if (na && !doneNa) {
    let value = na, color = 'var(--primary)'
    if (due) {
      const d = Math.ceil((new Date(due).getTime() - Date.now()) / 86400000)
      if (d < 0) { value = `${na} · overdue`; color = 'var(--accent-rose)' }
      else if (d === 0) { value = `${na} · today`; color = 'var(--accent-amber)' }
      else if (d === 1) { value = `${na} · tomorrow`; color = 'var(--accent-amber)' }
    }
    chips.push({ key: 'next', label: 'Next step', value, color })
  }

  // ── Quick facts ──
  const facts: Fact[] = []
  const pushFact = (label: string, value: string | null) => {
    if (value != null && value !== '' && value !== '—') facts.push({ label, value })
  }
  pushFact('Rate', pct(data, 'current_rate'))
  pushFact('Credit', textValue(data, 'credit_score_range') ?? textValue(data, 'credit_score'))
  pushFact('DTI', pct(data, 'dti'))
  pushFact('LTV', pct(data, 'ltv'))
  pushFact('Occupancy', textValue(data, 'occupancy') ?? textValue(data, 'occupancy_type'))

  return (
    <section className="premium-card relative overflow-hidden rounded-xl p-4">
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5" style={{ background: 'linear-gradient(90deg, var(--accent-violet), transparent)' }} />

      {/* Band 1 — Identity + Property */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold tracking-tight text-foreground">{name}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          {amount != null && (
            <p className="mt-1 text-2xl font-bold leading-none tracking-tight tabular-nums" style={{ color: 'var(--accent-green)' }}>
              {formatCurrency(amount)}
            </p>
          )}
        </div>
        {hasProperty && (
          <div className="min-w-0 sm:text-right">
            <p className="flex items-center gap-1 text-2xs font-semibold uppercase tracking-wider text-muted-foreground sm:justify-end">
              <MapPin className="h-3 w-3" /> Property
            </p>
            {address && <p className="mt-0.5 truncate text-sm font-medium text-foreground">{address}</p>}
            {cityState && <p className="text-2xs text-muted-foreground">{cityState}</p>}
            {propSub && <p className="text-2xs text-muted-foreground">{propSub}</p>}
          </div>
        )}
      </div>

      {/* Band 2 — Health indicators */}
      <div className="mt-3 flex flex-wrap gap-2 border-t border-border/60 pt-3">
        {chips.map((c) => (
          <div key={c.key} className="flex items-center gap-2 rounded-lg bg-surface-1/70 px-2.5 py-1.5">
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: c.color }} aria-hidden />
            <div className="min-w-0">
              <p className="text-[10px] uppercase leading-none tracking-wider text-muted-foreground">{c.label}</p>
              <p className="mt-0.5 truncate text-xs font-semibold text-foreground">{c.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Band 3 — Quick facts */}
      {facts.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border/60 pt-3 sm:grid-cols-3 lg:grid-cols-5">
          {facts.map((f) => (
            <div key={f.label} className="rounded-lg bg-surface-1/70 px-3 py-2">
              <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{f.label}</p>
              <p className="mt-0.5 truncate text-sm font-semibold tabular-nums text-foreground">{f.value}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
