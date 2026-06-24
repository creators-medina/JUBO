'use client'

// ─────────────────────────────────────────────────────────────────────────
// ParticipantRibbon (Phase 10.6) — a lightweight "file team" ribbon beneath the
// Borrower Intelligence Header. NOT a participant system: it only reads fields
// already loaded — known mortgage participant slugs (assigned_lo / partner_name
// / referral_source / co-borrower), generic relation|user fields with a readable
// value, and the record owner resolved via already-loaded profiles. Raw UUIDs
// are hidden; duplicates collapsed. If no participant data exists beyond the
// borrower, the whole ribbon collapses. No queries, no new tables/joins.
// ─────────────────────────────────────────────────────────────────────────

import { textValue } from '@/features/mortgage/data'
import type { MortgageData } from '@/features/mortgage/types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-/i

function initials(s: string): string {
  const p = s.trim().split(/\s+/).filter(Boolean)
  if (p.length === 0) return '—'
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase()
  return (p[0][0] + p[p.length - 1][0]).toUpperCase()
}

type Participant = { key: string; role: string; name: string; company?: string | null; color: string }

export function ParticipantRibbon({ data }: { data: MortgageData }) {
  const others: Participant[] = []
  const seen = new Set<string>()
  const add = (key: string, role: string, name: string | null | undefined, color: string, company?: string | null) => {
    const n = (name ?? '').toString().trim()
    if (!n || UUID_RE.test(n)) return
    const dedup = n.toLowerCase()
    if (seen.has(dedup)) return
    seen.add(dedup)
    others.push({ key, role, name: n, company: company?.toString().trim() || null, color })
  }

  add('coborrower', 'Co-Borrower', textValue(data, 'co_borrower') ?? textValue(data, 'co_borrower_name') ?? textValue(data, 'coborrower'), 'var(--accent-violet)')
  const profiles = (data as any).profiles as Record<string, string> | undefined
  const lo = textValue(data, 'assigned_lo') ?? (data.record?.owner_user_id ? (profiles?.[data.record.owner_user_id] ?? null) : null)
  add('lo', 'Loan Officer', lo, 'var(--accent-blue)')
  add('realtor', 'Realtor', textValue(data, 'partner_name'), 'var(--accent-amber)', textValue(data, 'brokerage_company'))
  add('referral', 'Referral', textValue(data, 'referral_source'), 'var(--accent-green)')

  // Generic relation/user fields — role = field name, value must be readable.
  for (const f of data.fields ?? []) {
    if (f.field_type !== 'relation' && f.field_type !== 'user') continue
    const fv = data.fieldValues.find((v: any) => v.field_id === f.id)
    add(`f-${f.id}`, f.name, fv?.value_text, 'var(--accent-cyan)')
  }

  if (others.length === 0) return null // nothing beyond the borrower → collapse

  const chips: Participant[] = [
    { key: 'borrower', role: 'Borrower', name: data.record?.title ?? 'Borrower', color: 'var(--primary)' },
    ...others,
  ]

  return (
    <section className="rounded-xl border border-border/60 bg-surface-1/30 p-3">
      <p className="mb-2 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">File team</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <div key={c.key} className="flex items-center gap-2 rounded-lg bg-surface-1/70 px-2.5 py-1.5">
            <span
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-2xs font-semibold text-white"
              style={{ backgroundColor: c.color }}
              aria-hidden
            >
              {initials(c.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-foreground">{c.name}</p>
              <p className="truncate text-2xs text-muted-foreground">{c.role}{c.company ? ` · ${c.company}` : ''}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
