// ─────────────────────────────────────────────────────────────────────────
// Heuristic inference for "Create Board From File". Pure functions.
//
// Looks at the file name + headers + sample rows and proposes:
//   1. a board name + board_type + record_type + friendly type label
//   2. a group/status column → pipeline groups (e.g. New / Contacted / Closed)
//
// Mortgage-flavored keyword tables — kept here so the core importer engine
// stays generic. Add or tune categories without touching the executor.
// ─────────────────────────────────────────────────────────────────────────

import type { BoardType, RecordType, FieldType } from '@/types/database'
import { inferColumnType } from '../validation/typeInference'

export type BoardSuggestion = {
  name: string
  boardType: BoardType
  recordType: RecordType
  /** Friendly label shown to the user ("Referral Partners", "Loan Pipeline"). */
  typeLabel: string
  confidence: number
  reason: string
}

export type ProposedField = {
  columnIndex: number
  header: string
  name: string
  fieldType: FieldType
  confidence: number
  include: boolean
  /** Optional config passed through to the created field (e.g. select options). */
  config?: Record<string, unknown>
}

export type GroupSuggestion = {
  columnIndex: number
  header: string
  /** Distinct values in first-seen order, capped. Become the board's groups. */
  values: string[]
}

type Category = {
  key: string
  boardType: BoardType
  recordType: RecordType
  typeLabel: string
  defaultName: string
  filenameKeywords: string[]
  headerKeywords: string[]
}

// Most specific first — referral partners outrank generic "contacts", pipeline
// outranks generic "leads" when loan/credit/closing headers are present.
const CATEGORIES: Category[] = [
  {
    key: 'referral',
    boardType: 'crm', recordType: 'referral',
    typeLabel: 'Referral Partners', defaultName: 'Referral Partners',
    filenameKeywords: ['realtor', 'realtors', 'agent', 'agents', 'partner', 'partners', 'referral', 'referrals', 'broker', 'brokerage'],
    headerKeywords: ['brokerage', 'brokerage_company', 'partner_name', 'realtor', 'agent', 'company'],
  },
  {
    key: 'past_clients',
    boardType: 'crm', recordType: 'contact',
    typeLabel: 'Past Clients', defaultName: 'Past Clients',
    filenameKeywords: ['past', 'client', 'clients', 'closed', 'funded', 'alumni', 'customer', 'customers'],
    headerKeywords: ['closed_date', 'funded_date', 'original_loan'],
  },
  {
    key: 'pipeline',
    boardType: 'pipeline', recordType: 'loan',
    typeLabel: 'Loan Pipeline', defaultName: 'Loan Pipeline',
    filenameKeywords: ['pipeline', 'loan', 'loans', 'application', 'applications', 'underwriting', 'processing', 'escrow'],
    headerKeywords: ['loan_amount', 'loan_type', 'credit_score', 'target_close_date'],
  },
  {
    key: 'leads',
    boardType: 'crm', recordType: 'lead',
    typeLabel: 'Leads', defaultName: 'Leads',
    filenameKeywords: ['lead', 'leads', 'prospect', 'prospects', 'inquiry', 'inquiries', 'contact', 'contacts'],
    headerKeywords: ['lead_source', 'source'],
  },
]

const FALLBACK = { boardType: 'custom' as BoardType, recordType: 'lead' as RecordType, typeLabel: 'Custom board' }

function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean)
}

function normalizeHeader(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function stripExtension(name: string): string {
  return name.replace(/\.[a-z0-9]{1,5}$/i, '')
}

/** "first_name" / "First Name " → "First name" — friendlier display defaults. */
export function humanize(s: string): string {
  const cleaned = stripExtension(s).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!cleaned) return s
  return cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase()
}

export function inferBoard(fileName: string, headers: string[]): BoardSuggestion {
  const fnTokens = new Set(tokenize(fileName))
  const headerTokens = new Set<string>()
  for (const h of headers) {
    for (const t of tokenize(h)) headerTokens.add(t)
    headerTokens.add(normalizeHeader(h))
  }

  let best: { cat: Category; score: number; fHits: number; hHits: number } | null = null
  for (const cat of CATEGORIES) {
    let fHits = 0
    for (const k of cat.filenameKeywords) if (fnTokens.has(k)) fHits++
    let hHits = 0
    for (const k of cat.headerKeywords) if (headerTokens.has(k)) hHits++
    const score = fHits * 2 + hHits
    if (score > 0 && (!best || score > best.score)) best = { cat, score, fHits, hHits }
  }

  if (best) {
    const denom = Math.max(2, best.cat.filenameKeywords.length * 0.5)
    const confidence = Math.min(1, best.score / denom)
    const where = [best.fHits > 0 ? 'file name' : null, best.hHits > 0 ? 'column names' : null].filter(Boolean).join(' + ')
    return {
      name: best.cat.defaultName,
      boardType: best.cat.boardType,
      recordType: best.cat.recordType,
      typeLabel: best.cat.typeLabel,
      confidence,
      reason: `matched on ${where || 'columns'}`,
    }
  }

  const cleaned = humanize(fileName) || 'New Board'
  return {
    name: cleaned,
    boardType: FALLBACK.boardType,
    recordType: FALLBACK.recordType,
    typeLabel: FALLBACK.typeLabel,
    confidence: 0.3,
    reason: 'using your file name',
  }
}

// ── Group / status column detection ──────────────────────────────────────────
const GROUP_HEADER_RE = /^(status|stage|milestone|pipeline.?status|loan.?status|phase|state|funnel.?stage|deal.?stage|lead.?status)$/i

/**
 * Look for a column that looks like a pipeline status: header match first, then
 * any column with a small set of short text values (not email/phone/number/date).
 * Returns the distinct values in first-seen order — these become board groups.
 */
export function detectGroupColumn(headers: string[], rows: string[][]): GroupSuggestion | null {
  if (headers.length === 0 || rows.length === 0) return null

  type Candidate = { columnIndex: number; header: string; values: string[]; byHeader: boolean; distinct: number }
  const out: Candidate[] = []

  for (let c = 0; c < headers.length; c++) {
    const header = headers[c]
    const compact = header.toLowerCase().replace(/[\s_-]+/g, '')
    const byHeader = GROUP_HEADER_RE.test(header) || /^(status|stage|milestone|phase|state)$/.test(compact)

    const valueSet = new Set<string>()
    let nonEmpty = 0
    let tooLong = false
    for (const r of rows) {
      const raw = r?.[c]
      if (raw == null) continue
      const v = `${raw}`.trim()
      if (v === '') continue
      nonEmpty++
      if (v.length > 24) { tooLong = true; break }
      valueSet.add(v)
    }
    if (tooLong || nonEmpty === 0) continue
    const distinct = valueSet.size
    if (distinct < 2 || distinct > 12) continue
    if (distinct / nonEmpty > 0.5) continue

    // Don't treat email/phone/number/date columns as group columns.
    const sample = Array.from(valueSet).slice(0, 8)
    const inferred = inferColumnType(sample)
    if (inferred.type !== 'text' && inferred.type !== 'select') continue

    // Stable order — preserve first appearance in the data.
    const values: string[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      const v = (r?.[c] ?? '').trim()
      if (!v || seen.has(v)) continue
      seen.add(v); values.push(v)
      if (values.length >= 24) break
    }
    out.push({ columnIndex: c, header, values, byHeader, distinct })
  }

  if (out.length === 0) return null
  // Header match wins; then fewest distinct values (cleanest pipeline).
  out.sort((a, b) => Number(b.byHeader) - Number(a.byHeader) || a.distinct - b.distinct)
  const top = out[0]
  return { columnIndex: top.columnIndex, header: top.header, values: top.values }
}
