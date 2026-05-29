// ─────────────────────────────────────────────────────────────────────────
// Column → field auto-mapping. Fuzzy + synonym + type-aware. Pure functions.
//
// Strategy per column: pick the title column first (record name), then resolve
// each remaining column to the best field by exact/synonym/fuzzy/type score.
// The mortgage-flavored synonyms are just hints — the engine stays generic.
// ─────────────────────────────────────────────────────────────────────────

import { inferColumnType } from '../validation/typeInference'
import { TITLE_TARGET, type ColumnMapping, type MappingMetadata, type TargetField } from '../types'

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

// Headers that should become the record title.
const TITLE_SYNONYMS = ['name', 'full name', 'client', 'client name', 'borrower', 'borrower name', 'contact', 'contact name', 'company', 'partner name', 'lead', 'lead name', 'title', 'first name']

// Header phrase → candidate field slug. Helps map real-world exports.
const FIELD_SYNONYMS: Record<string, string> = {
  'phone': 'phone', 'phone number': 'phone', 'mobile': 'phone', 'cell': 'phone', 'cell phone': 'phone',
  'email': 'email', 'e mail': 'email', 'email address': 'email',
  'loan amount': 'loan_amount', 'loan amt': 'loan_amount', 'amount': 'loan_amount', 'loan size': 'loan_amount',
  'credit score': 'credit_score_range', 'credit': 'credit_score_range', 'fico': 'credit_score_range',
  'lead source': 'lead_source', 'source': 'lead_source',
  'referral source': 'referral_source', 'referred by': 'referral_source',
  'target close date': 'target_close_date', 'close date': 'target_close_date', 'closing date': 'target_close_date', 'est close': 'target_close_date',
  'preapproval expiration': 'preapproval_expiration', 'preapproval exp': 'preapproval_expiration', 'preapproval expires': 'preapproval_expiration',
  'next action': 'next_action', 'next step': 'next_action',
  'partner name': 'partner_name', 'realtor': 'partner_name', 'agent': 'partner_name',
  'loan type': 'loan_type', 'program': 'loan_type',
  'closed date': 'closed_date', 'funded date': 'closed_date',
  'current rate': 'current_rate', 'rate': 'current_rate',
  'brokerage': 'brokerage_company', 'company name': 'brokerage_company',
}

function columnSamples(rows: string[][], colIndex: number, limit = 25): string[] {
  const out: string[] = []
  for (let i = 0; i < rows.length && out.length < limit; i++) {
    const v = rows[i]?.[colIndex]
    if (v != null && `${v}`.trim() !== '') out.push(`${v}`)
  }
  return out
}

/** Token-overlap similarity in [0,1]. */
function similarity(a: string, b: string): number {
  if (a === b) return 1
  const ta = new Set(a.split(' ').filter(Boolean))
  const tb = new Set(b.split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = new Set([...ta, ...tb]).size
  let score = inter / union
  if (a.includes(b) || b.includes(a)) score = Math.max(score, 0.7)
  return score
}

/** Produce a full mapping for every column. */
export function autoMapColumns(headers: string[], rows: string[][], fields: TargetField[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = []
  let titleAssigned = false

  const fieldBySlug = new Map(fields.map((f) => [f.slug, f]))

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const nHeader = norm(header)
    const samples = columnSamples(rows, i)
    const inferred = inferColumnType(samples)

    let target = ''
    let meta: MappingMetadata = { confidence: 0, reason: 'skipped' }

    // 1. Title column — take the first strong title-synonym match.
    if (!titleAssigned && TITLE_SYNONYMS.some((t) => nHeader === t || nHeader.includes(t))) {
      target = TITLE_TARGET
      titleAssigned = true
      meta = { confidence: 0.95, reason: 'matched-by-header' }
    } else {
      // 2. Synonym → field slug.
      const synSlug = FIELD_SYNONYMS[nHeader]
      const synField = synSlug ? fieldBySlug.get(synSlug) : undefined
      if (synField) {
        target = synField.id
        meta = { confidence: 0.9, reason: 'synonym' }
      } else {
        // 3. Fuzzy match against field names/slugs, with a type-match bonus.
        let best: { id: string; score: number; typeMatch: boolean } | null = null
        for (const f of fields) {
          const typeMatch = f.field_type === inferred.type && inferred.confidence >= 0.6
          let score = Math.max(similarity(nHeader, norm(f.name)), similarity(nHeader, norm(f.slug)))
          if (typeMatch) score += 0.15
          if (!best || score > best.score) best = { id: f.id, score, typeMatch }
        }
        if (best && best.score >= 0.5) {
          target = best.id
          meta = { confidence: Math.min(1, best.score), reason: best.typeMatch ? 'type-detected' : 'fuzzy-match' }
        }
      }
    }

    mappings.push({ columnIndex: i, header, target, inferred, meta })
  }

  return mappings
}
