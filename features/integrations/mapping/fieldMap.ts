// ─────────────────────────────────────────────────────────────────────────
// Normalized event → Jubo board routing + field-slug mapping.
//
// Routing picks a starter board by entity type. Field mapping emits {slug, raw}
// pairs only for KNOWN starter field slugs — keeping random payload keys out of
// the record (the processor drops any slug the target board doesn't have).
// ─────────────────────────────────────────────────────────────────────────

import type { NormalizedEvent } from '../types'

/** Which starter board a normalized event should land on. */
export function routeBoardSlug(ev: NormalizedEvent): string {
  // Loans / pipeline-ish go to the pipeline board; everything else to active leads.
  if (ev.entityType === 'loan') return 'loan-pipeline'
  return 'active-leads'
}

/** A human title for the record. */
export function eventTitle(ev: NormalizedEvent): string {
  return (
    ev.person.fullName ||
    [ev.person.firstName, ev.person.lastName].filter(Boolean).join(' ') ||
    ev.person.email ||
    ev.person.phone ||
    'Synced contact'
  )
}

/** Map known normalized values to starter field slugs (raw string values). */
export function normalizedFieldInputs(ev: NormalizedEvent): { slug: string; raw: string }[] {
  const out: { slug: string; raw: string }[] = []
  const push = (slug: string, v: string | number | undefined | null) => {
    if (v == null) return
    const s = `${v}`.trim()
    if (s !== '') out.push({ slug, raw: s })
  }

  push('email', ev.person.email)
  push('phone', ev.person.phone)
  push('loan_amount', ev.loan.loanAmount)
  push('loan_type', ev.loan.loanType)
  push('loan_purpose', ev.loan.loanPurpose)
  push('target_close_date', ev.loan.closingDate)

  return out
}
