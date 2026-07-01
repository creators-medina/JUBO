'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase D3-LP-2 — the Loan & Property Info tab (Arrive-style), fully editable.
//
// Renders the canonical loan schema (features/mortgage/loanFields.ts) across
// three sub-tabs (Loan / Property / Title) + the Proposed Monthly Payment panel,
// scrolling inside the floating card. Every input persists to the record via
// upsertFieldValue; missing fields are provisioned (hidden from the board grid)
// on open. Computed cells (LTV/CLTV/HCLTV/Total Loan/Total PITI) are derived
// LIVE from entered values — never fabricated.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Loader2, Eye } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { upsertFieldValue } from '@/features/records/actions'
import { ensureLoanPropertyFields } from '@/features/mortgage/loanFieldActions'
import { LOAN_FIELDS, PITI_ROWS, type LoanField, type LoanSubtab } from '@/features/mortgage/loanFields'
import { LockedField } from './LockedField'
import { cn } from '@/lib/utils'

type Vals = Record<string, { value_text: string | null; value_number: number | null; value_boolean: boolean | null; value_date: string | null }>

const SUBTABS: { key: LoanSubtab; label: string }[] = [
  { key: 'loan', label: 'Loan Info' },
  { key: 'property', label: 'Property Info' },
  { key: 'title', label: 'Title Info' },
]

const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`)
const pct = (n: number | null) => (n == null ? '—' : `${n.toFixed(2)}%`)

export function LoanPropertyTab({ recordId, boardId, organizationId }: { recordId: string; boardId: string | null; organizationId: string }) {
  const [fieldIdBySlug, setFieldIdBySlug] = useState<Record<string, string>>({})
  const [vals, setVals] = useState<Vals>({})
  const [subtab, setSubtab] = useState<LoanSubtab>('loan')
  const [loading, setLoading] = useState(true)
  const [savingSlug, setSavingSlug] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!boardId) { setLoading(false); return }
    const supabase = createClient()
    const [{ data: fields }, { data: fvs }] = await Promise.all([
      supabase.from('fields').select('id, slug').eq('board_id', boardId),
      supabase.from('field_values').select('field_id, value_text, value_number, value_boolean, value_date').eq('record_id', recordId),
    ])
    const idBySlug: Record<string, string> = {}
    const idToSlug: Record<string, string> = {}
    for (const f of fields ?? []) { idBySlug[(f as any).slug] = (f as any).id; idToSlug[(f as any).id] = (f as any).slug }
    const v: Vals = {}
    for (const fv of fvs ?? []) {
      const slug = idToSlug[(fv as any).field_id]
      if (!slug) continue
      v[slug] = { value_text: (fv as any).value_text, value_number: (fv as any).value_number, value_boolean: (fv as any).value_boolean, value_date: (fv as any).value_date }
    }
    setFieldIdBySlug(idBySlug)
    setVals(v)
    setLoading(false)
  }, [recordId, boardId])

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      // Non-fatal, but NOT silent — a provisioning failure (e.g. onConflict/RLS)
      // must be visible in the console, never swallowed. The tab still renders
      // read-only if provisioning genuinely fails.
      if (boardId) { try { await ensureLoanPropertyFields(boardId, organizationId) } catch (e) { console.error('ensureLoanPropertyFields failed', e) } }
      if (active) await load()
    })()
    return () => { active = false }
  }, [boardId, organizationId, load])

  // Live write-through. Optimistic local update + persist; computed cells re-derive.
  const save = useCallback(async (slug: string, patch: Partial<Vals[string]>) => {
    setVals((prev) => {
      const cur = prev[slug] ?? { value_text: null, value_number: null, value_boolean: null, value_date: null }
      return { ...prev, [slug]: { ...cur, ...patch } }
    })
    const fieldId = fieldIdBySlug[slug]
    if (!fieldId || !boardId) return
    setSavingSlug(slug)
    try { await upsertFieldValue(fieldId, recordId, boardId, patch) } finally { setSavingSlug(null) }
  }, [fieldIdBySlug, recordId, boardId])

  const num = (slug: string): number | null => vals[slug]?.value_number ?? null
  const isRefi = (vals['loan_purpose']?.value_text ?? 'Purchase') === 'Refinance'

  // ── Computed cells (live, from entered values — not fabricated) ──
  const computed = useMemo(() => {
    const appraised = num('appraised_value')
    const base = num('loan_amount')
    const liens = num('existing_liens_amount') ?? 0
    const totalLoan = base != null ? base + (vals['subordinate_liens']?.value_boolean ? liens : 0) : null
    const ltv = appraised && appraised > 0 && base != null ? (base / appraised) * 100 : null
    const combined = appraised && appraised > 0 && base != null ? ((base + liens) / appraised) * 100 : null
    const totalPiti = PITI_ROWS.reduce((sum, r) => sum + (num(r.slug) ?? 0), 0)
    const hasPiti = PITI_ROWS.some((r) => num(r.slug) != null)
    return { totalLoan, ltv, cltv: combined, hcltv: combined, totalPiti: hasPiti ? totalPiti : null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals])

  const computedValue = (key?: string): string => {
    switch (key) {
      case 'total_loan_amount': return fmtMoney(computed.totalLoan)
      case 'ltv': return pct(computed.ltv)
      case 'cltv': return pct(computed.cltv)
      case 'hcltv': return pct(computed.hcltv)
      default: return '—'
    }
  }

  if (!boardId) {
    return <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">This record isn’t on a board, so loan fields can’t be stored.</div>
  }
  if (loading) {
    return <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading loan file…</div>
  }

  const inSubtab = (section: string) => LOAN_FIELDS.filter((f) => f.subtab === subtab && f.section === section && (!f.refiOnly || isRefi))
  const sections = [...new Set(LOAN_FIELDS.filter((f) => f.subtab === subtab).map((f) => f.section))]

  return (
    <div className="jubo-los-page space-y-4 rounded-xl p-4">
      {/* Sub-tabs */}
      <div className="flex gap-1">
        {SUBTABS.map((s) => (
          <button key={s.key} onClick={() => setSubtab(s.key)}
            className={cn('rounded-md px-3 py-1 text-xs font-medium transition-colors',
              subtab === s.key ? 'bg-jubo-navy text-white' : 'text-jubo-muted hover:text-jubo-text')}>
            {s.label}
          </button>
        ))}
        {savingSlug && <span className="ml-auto flex items-center gap-1 text-2xs text-jubo-muted"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
      </div>

      {subtab === 'loan' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
          {/* LEFT — Loan Info + Lock */}
          <div className="space-y-4">
            {['Loan Info', 'Lock'].map((section) => (
              <FieldCard key={section} title={section}>
                {section === 'Loan Info' && (
                  <PurchaseRefiToggle value={isRefi ? 'Refinance' : 'Purchase'} onChange={(v) => save('loan_purpose', { value_text: v })} />
                )}
                {inSubtab(section).filter((f) => f.slug !== 'loan_purpose').map((f) => (
                  <FieldRow key={f.slug} field={f} vals={vals} computedValue={computedValue} onSave={save} />
                ))}
              </FieldCard>
            ))}
          </div>

          {/* RIGHT — Proposed Monthly Payment + Loan Details */}
          <div className="space-y-4">
            <PitiPanel vals={vals} onSave={save} total={computed.totalPiti} />
            <FieldCard title="Loan Details">
              {inSubtab('Loan Details').map((f) => (
                <FieldRow key={f.slug} field={f} vals={vals} computedValue={computedValue} onSave={save} />
              ))}
            </FieldCard>
          </div>
        </div>
      ) : (
        <div className="max-w-xl">
          {sections.map((section) => (
            <FieldCard key={section} title={section}>
              {inSubtab(section).map((f) => (
                <FieldRow key={f.slug} field={f} vals={vals} computedValue={computedValue} onSave={save} />
              ))}
            </FieldCard>
          ))}
        </div>
      )}
    </div>
  )
}

function FieldCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="jubo-los-card p-3.5">
      <p className="jubo-los-section-label mb-3">{title}</p>
      <div className="space-y-2.5">{children}</div>
    </section>
  )
}

function PurchaseRefiToggle({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-lg border border-jubo-border p-1">
      {['Purchase', 'Refinance'].map((v) => (
        <button key={v} onClick={() => onChange(v)}
          className={cn('rounded-md py-1.5 text-xs font-medium transition-colors',
            value === v ? 'bg-jubo-navy text-white' : 'text-jubo-muted hover:text-jubo-text')}>
          {v}
        </button>
      ))}
    </div>
  )
}

function FieldRow({
  field, vals, computedValue, onSave,
}: {
  field: LoanField
  vals: Vals
  computedValue: (key?: string) => string
  onSave: (slug: string, patch: Partial<Vals[string]>) => void
}) {
  const v = vals[field.slug]
  const req = field.required ? <span className="text-jubo-red"> *</span> : null

  // SEC-LOCK — sensitive fields are locked (no input/read/write). None today on
  // the loan schema, but the guard keeps the mechanism uniform across all tabs.
  if (field.sensitive) {
    return <LockedField label={field.label} />
  }

  // Computed cells are read-only, derived live.
  if (field.computed) {
    return (
      <Labeled label={field.label} req={req}>
        <span className="text-xs font-semibold text-jubo-text tabular-nums">{computedValue(field.computed)}</span>
      </Labeled>
    )
  }

  if (field.type === 'boolean') {
    return (
      <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
        <span className="text-jubo-muted">{field.label}{req}</span>
        <input type="checkbox" checked={v?.value_boolean === true} onChange={(e) => onSave(field.slug, { value_boolean: e.target.checked })}
          className="h-4 w-4 rounded border-jubo-border-strong" />
      </label>
    )
  }

  if (field.type === 'select') {
    return (
      <Labeled label={field.label} req={req}>
        <select value={v?.value_text ?? ''} onChange={(e) => onSave(field.slug, { value_text: e.target.value || null })}
          className="w-40 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy">
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Labeled>
    )
  }

  if (field.type === 'date') {
    return (
      <Labeled label={field.label} req={req}>
        <input type="date" value={v?.value_date ? v.value_date.split('T')[0] : ''} onChange={(e) => onSave(field.slug, { value_date: e.target.value || null })}
          className="w-40 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
      </Labeled>
    )
  }

  if (field.type === 'text') {
    return (
      <Labeled label={field.label} req={req}>
        <input type="text" defaultValue={v?.value_text ?? ''} onBlur={(e) => onSave(field.slug, { value_text: e.target.value || null })}
          className="w-40 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
      </Labeled>
    )
  }

  // currency | number | percent → numeric
  const prefix = field.type === 'currency' ? '$' : null
  const suffix = field.type === 'percent' ? '%' : field.unit === 'months' ? 'mo' : null
  return (
    <Labeled label={field.label} req={req}>
      <div className="flex w-40 items-center gap-1 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 focus-within:ring-1 focus-within:ring-jubo-navy">
        {prefix && <span className="text-2xs text-jubo-muted">{prefix}</span>}
        <input type="number" step="any" defaultValue={v?.value_number ?? ''}
          onBlur={(e) => { const t = e.target.value.trim(); onSave(field.slug, { value_number: t === '' ? null : Number(t) }) }}
          className="w-full bg-transparent text-right text-xs text-jubo-text focus:outline-none" />
        {suffix && <span className="text-2xs text-jubo-muted">{suffix}</span>}
      </div>
    </Labeled>
  )
}

function Labeled({ label, req, children }: { label: string; req: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-jubo-muted">{label}{req}</span>
      {children}
    </div>
  )
}

function PitiPanel({ vals, onSave, total }: { vals: Vals; onSave: (slug: string, patch: Partial<Vals[string]>) => void; total: number | null }) {
  return (
    <section className="jubo-los-card p-3.5">
      <div className="mb-3 flex items-center justify-between">
        <p className="jubo-los-section-label">Proposed Monthly Payment</p>
        <span className="flex items-center gap-1 text-2xs text-jubo-muted"><Eye className="h-3 w-3" /> Preview</span>
      </div>
      <div className="space-y-1.5">
        {PITI_ROWS.map((r) => (
          <div key={r.slug} className="flex items-center justify-between gap-2">
            <span className="text-xs text-jubo-muted">{r.label}</span>
            <div className="flex w-28 items-center gap-1 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 focus-within:ring-1 focus-within:ring-jubo-navy">
              <span className="text-2xs text-jubo-muted">$</span>
              <input type="number" step="any" defaultValue={vals[r.slug]?.value_number ?? ''}
                onBlur={(e) => { const t = e.target.value.trim(); onSave(r.slug, { value_number: t === '' ? null : Number(t) }) }}
                className="w-full bg-transparent text-right text-xs text-jubo-text focus:outline-none" />
            </div>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between border-t border-jubo-border pt-2">
          <span className="text-xs font-semibold text-jubo-text">Total PITI</span>
          <span className="text-sm font-bold text-jubo-text tabular-nums">{total == null ? '—' : fmtMoney(total)}</span>
        </div>
      </div>
    </section>
  )
}
