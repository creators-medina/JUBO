'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase D3-BI-2 — the Borrower Info tab (Arrive 1003-style), fully editable.
//
// Multiple borrowers per record (record_borrowers). A selector switches between
// the primary borrower and co-borrowers; the form edits the selected borrower's
// JSONB. Four sub-tabs (Basic / Declarations / Demographics / Additional). Age
// is computed from DOB; SSN is masked. The primary borrower's email/cell phone
// mirror into the record's phone/email fields (server side) so the header
// Call/Email + SMS composer keep working.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useState, useCallback } from 'react'
import { Loader2, X, UserPlus } from 'lucide-react'
import {
  getBorrowers, ensurePrimaryBorrower, addBorrower, removeBorrower, saveBorrower, type BorrowerRow,
} from './borrowerActions'
import {
  BORROWER_FIELDS, BORROWER_SUBTABS, borrowerName, type BorrowerField, type BorrowerSubtab,
} from '@/features/mortgage/borrowerFields'
import { cn } from '@/lib/utils'

function ageFromDob(dob: unknown): string {
  if (typeof dob !== 'string' || !dob) return '—'
  const d = new Date(dob)
  if (Number.isNaN(d.getTime())) return '—'
  const now = new Date()
  let a = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--
  return a >= 0 && a < 150 ? String(a) : '—'
}

export function BorrowerTab({ recordId }: { recordId: string }) {
  const [borrowers, setBorrowers] = useState<BorrowerRow[] | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [subtab, setSubtab] = useState<BorrowerSubtab>('basic')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (preferId?: string) => {
    let list = await ensurePrimaryBorrower(recordId)
    if (list.length === 0) list = await getBorrowers(recordId)
    setBorrowers(list)
    setSelectedId((cur) => preferId ?? cur ?? (list[0]?.id ?? null))
  }, [recordId])

  useEffect(() => { load() }, [load])

  const selected = borrowers?.find((b) => b.id === selectedId) ?? null

  const save = useCallback((slug: string, value: unknown) => {
    if (!selected) return
    // Optimistic local merge, then persist.
    setBorrowers((prev) => prev?.map((b) => b.id === selected.id ? { ...b, data: { ...b.data, [slug]: value } } : b) ?? prev)
    saveBorrower(selected.id, { [slug]: value }).catch(() => {})
  }, [selected])

  const onAdd = async () => {
    setBusy(true)
    try { const b = await addBorrower(recordId); await load(b?.id) } finally { setBusy(false) }
  }
  const onRemove = async (id: string) => {
    if (!confirm('Remove this borrower?')) return
    setBusy(true)
    try { await removeBorrower(id); await load() } finally { setBusy(false) }
  }

  if (borrowers === null) {
    return <div className="flex items-center gap-2 py-8 text-xs text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading borrowers…</div>
  }

  const sections = [...new Set(BORROWER_FIELDS.filter((f) => f.subtab === subtab).map((f) => f.section))]

  return (
    <div className="jubo-los-page space-y-4 rounded-xl p-4">
      {/* Borrower selector */}
      <div className="flex flex-wrap items-center gap-2">
        {borrowers.map((b, i) => (
          <div key={b.id}
            className={cn('flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5',
              b.id === selectedId ? 'border-jubo-navy bg-jubo-navy text-white' : 'border-jubo-border bg-jubo-card text-jubo-text')}>
            <button onClick={() => setSelectedId(b.id)} className="text-left">
              <p className="text-xs font-medium">{borrowerName(b.data, i)}</p>
              <p className={cn('text-2xs', b.id === selectedId ? 'text-white/70' : 'text-jubo-muted')}>{b.is_primary ? 'Primary Borrower' : 'Co-Borrower'}</p>
            </button>
            {!b.is_primary && (
              <button onClick={() => onRemove(b.id)} title="Remove borrower" className={cn('rounded p-0.5', b.id === selectedId ? 'hover:bg-white/15' : 'hover:bg-surface-2')}>
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        <button onClick={onAdd} disabled={busy}
          className="flex items-center gap-1 rounded-lg border border-dashed border-jubo-border px-2.5 py-1.5 text-xs text-jubo-muted hover:text-jubo-text disabled:opacity-50">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />} Add borrower
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-1 border-b border-jubo-border">
        {BORROWER_SUBTABS.map((s) => (
          <button key={s.key} onClick={() => setSubtab(s.key)}
            className={cn('whitespace-nowrap border-b-2 -mb-px px-3 py-2 text-xs font-medium transition-colors',
              subtab === s.key ? 'border-jubo-navy text-jubo-navy' : 'border-transparent text-jubo-muted hover:text-jubo-text')}>
            {s.label}
          </button>
        ))}
      </div>

      {!selected ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No borrower selected.</p>
      ) : (
        sections.map((section) => {
          const fields = BORROWER_FIELDS.filter((f) => f.subtab === subtab && f.section === section)
          const isBasic = subtab === 'basic'
          return (
            <section key={section} className="jubo-los-card p-3.5">
              <p className="jubo-los-section-label mb-3">{section}</p>
              <div className={cn(isBasic ? 'grid grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2' : 'space-y-2.5')}>
                {fields.map((f) => (
                  <BorrowerInput key={f.slug} field={f} data={selected.data} onSave={save} />
                ))}
              </div>
            </section>
          )
        })
      )}
    </div>
  )
}

function BorrowerInput({ field, data, onSave }: { field: BorrowerField; data: Record<string, unknown>; onSave: (slug: string, value: unknown) => void }) {
  const v = data[field.slug]
  const req = field.required ? <span className="text-jubo-red"> *</span> : null
  const full = field.full ? 'sm:col-span-2' : ''

  if (field.computed === 'age') {
    return (
      <Row className={full} label={field.label} req={req}>
        <span className="text-xs font-semibold text-jubo-text tabular-nums">{ageFromDob(data['date_of_birth'])}</span>
      </Row>
    )
  }

  if (field.type === 'boolean') {
    const yes = v === true
    return (
      <div className={cn('flex items-center justify-between gap-2', full)}>
        <span className="text-xs text-jubo-muted">{field.label}{req}</span>
        <div className="flex overflow-hidden rounded-md border border-jubo-border">
          {[['No', false], ['Yes', true]].map(([lbl, val]) => (
            <button key={lbl as string} onClick={() => onSave(field.slug, val)}
              className={cn('px-2.5 py-1 text-2xs font-medium',
                yes === (val as boolean) ? 'bg-jubo-navy text-white' : 'bg-jubo-card text-jubo-muted hover:text-jubo-text')}>
              {lbl}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'select') {
    return (
      <Row className={full} label={field.label} req={req}>
        <select value={(v as string) ?? ''} onChange={(e) => onSave(field.slug, e.target.value || null)}
          className="w-44 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy">
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </Row>
    )
  }

  if (field.type === 'date') {
    return (
      <Row className={full} label={field.label} req={req}>
        <input type="date" value={typeof v === 'string' ? v.split('T')[0] : ''} onChange={(e) => onSave(field.slug, e.target.value || null)}
          className="w-44 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
      </Row>
    )
  }

  if (field.type === 'ssn') {
    return (
      <Row className={full} label={field.label} req={req}>
        <SsnInput value={(v as string) ?? ''} onSave={(val) => onSave(field.slug, val)} />
      </Row>
    )
  }

  if (field.type === 'number') {
    return (
      <Row className={full} label={field.label} req={req}>
        <input type="number" step="any" defaultValue={(v as number | string) ?? ''}
          onBlur={(e) => { const t = e.target.value.trim(); onSave(field.slug, t === '' ? null : Number(t)) }}
          className="w-44 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-right text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
      </Row>
    )
  }

  // text
  return (
    <Row className={full} label={field.label} req={req}>
      <input type="text" defaultValue={(v as string) ?? ''} onBlur={(e) => onSave(field.slug, e.target.value || null)}
        className={cn('rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy', field.full ? 'w-full' : 'w-44')} />
    </Row>
  )
}

function Row({ label, req, children, className }: { label: string; req: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-between gap-2', className)}>
      <span className="text-xs text-jubo-muted">{label}{req}</span>
      {children}
    </div>
  )
}

// SSN — shows masked (•••-••-1234) when blurred; reveals raw for editing on focus.
function SsnInput({ value, onSave }: { value: string; onSave: (v: string | null) => void }) {
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(value)
  const last4 = value.replace(/\D/g, '').slice(-4)
  const masked = value ? `•••-••-${last4 || '••••'}` : ''
  return (
    <input
      type="text"
      value={focused ? draft : masked}
      placeholder="•••-••-••••"
      onFocus={() => { setDraft(value); setFocused(true) }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); if (draft !== value) onSave(draft.trim() || null) }}
      className="w-44 rounded-md border border-jubo-border bg-jubo-card px-2 py-1 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy"
    />
  )
}
