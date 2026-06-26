'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase D3-FI-2 — the Financial Info tab (Arrive 1003-style), fully editable.
//
// Four sections (Income / Assets / Liabilities / REO), each a list of items with
// a live section total. "+ Add" appends an item; clicking an item expands an
// inline editor. Income/liability items can be tagged to a borrower. Section
// totals are mirrored to the record server-side (so the Overview + future DTI
// read them). DTI itself is deferred to D2 — only the raw totals live here.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import {
  getFinancials, addFinancialItem, saveFinancialItem, removeFinancialItem, type FinancialItem,
} from './financialActions'
import { getBorrowers, type BorrowerRow } from './borrowerActions'
import { borrowerName } from '@/features/mortgage/borrowerFields'
import {
  FIN_CATEGORIES, catDef, incomeMonthlyTotal, itemAmount, type FinCategory, type FinField,
} from '@/features/mortgage/financialFields'
import { cn } from '@/lib/utils'

const money = (n: number) => `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

export function FinancialTab({ recordId }: { recordId: string }) {
  const [items, setItems] = useState<FinancialItem[] | null>(null)
  const [borrowers, setBorrowers] = useState<BorrowerRow[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [its, brs] = await Promise.all([getFinancials(recordId), getBorrowers(recordId)])
    setItems(its)
    setBorrowers(brs)
  }, [recordId])
  useEffect(() => { load() }, [load])

  const primaryId = borrowers.find((b) => b.is_primary)?.id ?? borrowers[0]?.id ?? null

  const save = useCallback((itemId: string, slug: string, value: unknown) => {
    setItems((prev) => prev?.map((it) => it.id === itemId ? { ...it, data: { ...it.data, [slug]: value } } : it) ?? prev)
    saveFinancialItem(itemId, { [slug]: value }).catch(() => {})
  }, [])

  const linkBorrower = useCallback((itemId: string, borrowerId: string | null) => {
    setItems((prev) => prev?.map((it) => it.id === itemId ? { ...it, borrower_id: borrowerId } : it) ?? prev)
    saveFinancialItem(itemId, {}, borrowerId).catch(() => {})
  }, [])

  const add = async (category: FinCategory) => {
    setBusy(true)
    try {
      const def = catDef(category)
      const it = await addFinancialItem(recordId, category, def.borrowerLinked ? primaryId : null)
      if (it) { setItems((prev) => [...(prev ?? []), it]); setExpanded(it.id) }
    } finally { setBusy(false) }
  }
  const remove = async (itemId: string) => {
    setBusy(true)
    try { await removeFinancialItem(itemId); setItems((prev) => prev?.filter((it) => it.id !== itemId) ?? prev) } finally { setBusy(false) }
  }

  if (items === null) {
    return <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading financials…</div>
  }

  return (
    <div className="jubo-los-page space-y-4 rounded-xl p-4">
      {FIN_CATEGORIES.map((def) => {
        const rows = items.filter((it) => it.category === def.key).sort((a, b) => a.position - b.position)
        const total = rows.reduce((s, it) => s + itemAmount(def.key, it.data), 0)
        const extraTotals = def.key === 'liability'
          ? { paidOff: rows.filter((r) => r.data.will_be_paid_off).reduce((s, r) => s + (Number(r.data.unpaid_balance) || 0), 0),
              unpaid: rows.reduce((s, r) => s + (Number(r.data.unpaid_balance) || 0), 0) }
          : null
        return (
          <section key={def.key} className="jubo-los-card p-3.5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="jubo-los-section-label">{def.label}: <span className="text-jubo-text">{money(total)}</span></p>
              {extraTotals && (
                <span className="text-2xs text-jubo-muted">Paid Off: {money(extraTotals.paidOff)} · Total: {money(extraTotals.unpaid)}</span>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="py-2 text-center text-2xs text-jubo-muted">No {def.key === 'reo' ? 'real estate' : def.key} added.</p>
            ) : (
              <div className="space-y-1.5">
                {rows.map((it) => (
                  <ItemRow
                    key={it.id} def={def} item={it} borrowers={borrowers}
                    expanded={expanded === it.id}
                    onToggle={() => setExpanded(expanded === it.id ? null : it.id)}
                    onSave={(slug, v) => save(it.id, slug, v)}
                    onLink={(bid) => linkBorrower(it.id, bid)}
                    onRemove={() => remove(it.id)}
                  />
                ))}
              </div>
            )}

            <button onClick={() => add(def.key)} disabled={busy}
              className="mt-2 flex items-center gap-1 rounded-md border border-dashed border-jubo-border px-2.5 py-1 text-xs text-jubo-muted hover:text-jubo-text disabled:opacity-50">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {def.addLabel.replace('+ ', '')}
            </button>
          </section>
        )
      })}
    </div>
  )
}

function ItemRow({
  def, item, borrowers, expanded, onToggle, onSave, onLink, onRemove,
}: {
  def: typeof FIN_CATEGORIES[number]
  item: FinancialItem
  borrowers: BorrowerRow[]
  expanded: boolean
  onToggle: () => void
  onSave: (slug: string, value: unknown) => void
  onLink: (borrowerId: string | null) => void
  onRemove: () => void
}) {
  const summary = def.summaryFields.map((s) => item.data[s]).filter(Boolean).join(' · ') || '(new entry)'
  const amt = itemAmount(def.key, item.data)
  const borrower = borrowers.find((b) => b.id === item.borrower_id)

  return (
    <div className="rounded-lg border border-jubo-border bg-jubo-card">
      <button onClick={onToggle} className="flex w-full items-center gap-2 px-2.5 py-2 text-left">
        {expanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-jubo-muted" />}
        <span className="flex-1 truncate text-xs text-jubo-text">{summary}</span>
        {def.borrowerLinked && borrower && <span className="rounded bg-jubo-card-soft px-1.5 py-0.5 text-2xs text-jubo-muted">{borrowerName(borrower.data, borrower.position)}</span>}
        <span className="text-xs font-semibold text-jubo-text tabular-nums">{money(amt)}</span>
      </button>

      {expanded && (
        <div className="space-y-2.5 border-t border-jubo-border p-3">
          {def.borrowerLinked && borrowers.length > 0 && (
            <Labeled label="Borrower">
              <select value={item.borrower_id ?? ''} onChange={(e) => onLink(e.target.value || null)}
                className="w-44 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy">
                <option value="">—</option>
                {borrowers.map((b) => <option key={b.id} value={b.id}>{borrowerName(b.data, b.position)}</option>)}
              </select>
            </Labeled>
          )}
          <div className="grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {def.fields.map((f) => <FinInput key={f.slug} field={f} data={item.data} onSave={onSave} />)}
          </div>
          <div className="flex justify-end">
            <button onClick={onRemove} className="flex items-center gap-1 rounded-md px-2 py-1 text-2xs text-jubo-red hover:bg-jubo-red/10">
              <Trash2 className="h-3 w-3" /> Remove
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function FinInput({ field, data, onSave }: { field: FinField; data: Record<string, unknown>; onSave: (slug: string, value: unknown) => void }) {
  const v = data[field.slug]
  const full = field.full ? 'sm:col-span-2' : ''

  if (field.computed === 'income_monthly_total') {
    return (
      <Labeled label={field.label} className={full}>
        <span className="text-xs font-semibold text-jubo-text tabular-nums">{money(incomeMonthlyTotal(data))}</span>
      </Labeled>
    )
  }
  if (field.type === 'boolean') {
    return (
      <label className={cn('flex cursor-pointer items-center justify-between gap-2 text-xs', full)}>
        <span className="text-jubo-muted">{field.label}</span>
        <input type="checkbox" checked={v === true} onChange={(e) => onSave(field.slug, e.target.checked)} className="h-4 w-4 rounded border-jubo-border-strong" />
      </label>
    )
  }
  if (field.type === 'select') {
    return (
      <Labeled label={field.label} className={full}>
        <select value={(v as string) ?? ''} onChange={(e) => onSave(field.slug, e.target.value || null)}
          className="w-44 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy">
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Labeled>
    )
  }
  if (field.type === 'date') {
    return (
      <Labeled label={field.label} className={full}>
        <input type="date" value={typeof v === 'string' ? v.split('T')[0] : ''} onChange={(e) => onSave(field.slug, e.target.value || null)}
          className="w-44 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
      </Labeled>
    )
  }
  if (field.type === 'currency' || field.type === 'number') {
    return (
      <Labeled label={field.label} className={full}>
        <div className="flex w-44 items-center gap-1 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 focus-within:ring-1 focus-within:ring-jubo-navy">
          {field.type === 'currency' && <span className="text-2xs text-jubo-muted">$</span>}
          <input type="number" step="any" defaultValue={(v as number | string) ?? ''}
            onBlur={(e) => { const t = e.target.value.trim(); onSave(field.slug, t === '' ? null : Number(t)) }}
            className="w-full bg-transparent text-right text-xs text-jubo-text focus:outline-none" />
        </div>
      </Labeled>
    )
  }
  // text
  return (
    <Labeled label={field.label} className={full}>
      <input type="text" defaultValue={(v as string) ?? ''} onBlur={(e) => onSave(field.slug, e.target.value || null)}
        className={cn('rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy', field.full ? 'w-full' : 'w-44')} />
    </Labeled>
  )
}

function Labeled({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <span className="text-xs text-jubo-muted">{label}</span>
      {children}
    </div>
  )
}
