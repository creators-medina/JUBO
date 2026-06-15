// ─────────────────────────────────────────────────────────────────────────
// Column type conversion (Phase 35F).
//
// Pure helpers for changing a field's type. Conversions extract a canonical
// value from the source storage and re-store it for the target type. Only what
// can safely convert is kept; anything else becomes empty (a "loss" the UI
// warns about). Never throws, never corrupts — worst case a value goes empty.
// ─────────────────────────────────────────────────────────────────────────

import type { FieldType } from '@/types/database'
import type { FieldValueLike } from './checklist'

/** Types offered in the "Change type" menu. */
export const COLUMN_TYPE_OPTIONS: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'date', label: 'Date' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'url', label: 'URL' },
  { value: 'select', label: 'Select' },
  { value: 'multiselect', label: 'Multi-select' },
  { value: 'status', label: 'Status' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'boolean', label: 'Checkbox' },
]

const EMPTY: FieldValueLike = { value_text: null, value_number: null, value_boolean: null, value_date: null, value_json: null }

const isBoolType = (t: string) => t === 'boolean' || t === 'checklist'
const isNumType = (t: string) => t === 'number' || t === 'currency' || t === 'rating'
const isDateType = (t: string) => t === 'date' || t === 'datetime'
const isListType = (t: string) => t === 'multiselect' || t === 'tags'

const textOrNull = (s: unknown): string | null =>
  typeof s === 'string' && s.trim() !== '' ? s : null

/** Extract a canonical text representation of a value, by its source type. */
function toCanonicalText(fromType: string, fv?: FieldValueLike | null): string | null {
  if (!fv) return null
  if (isBoolType(fromType)) return fv.value_boolean === true ? 'true' : fv.value_boolean === false ? 'false' : null
  if (isNumType(fromType)) return fv.value_number != null ? String(fv.value_number) : null
  if (isDateType(fromType)) return textOrNull(fv.value_date)
  if (isListType(fromType)) {
    if (Array.isArray(fv.value_json)) return fv.value_json.length ? fv.value_json.map(String).join(', ') : null
    return textOrNull(fv.value_text)
  }
  return textOrNull(fv.value_text) // text/textarea/email/phone/url/select/status/relation/…
}

/**
 * Convert one field value from one type to another. Returns a full value patch
 * (all five columns) with the target column set and the rest nulled.
 */
export function convertFieldValue(fromType: string, toType: string, fv?: FieldValueLike | null): FieldValueLike {
  if (fromType === toType) return { ...EMPTY, ...(fv ?? {}) }
  const out: FieldValueLike = { ...EMPTY }

  // → boolean / checklist
  if (isBoolType(toType)) {
    if (isBoolType(fromType)) { out.value_boolean = fv?.value_boolean ?? null; return out }
    const t = toCanonicalText(fromType, fv)
    if (t == null) return out
    if (isNumType(fromType)) { out.value_boolean = Number(t) !== 0; return out }
    const low = t.trim().toLowerCase()
    out.value_boolean = low === 'true' || low === 'yes' || low === '1' || low === 'done' || low === 'checked'
    return out
  }

  // → status / select  (label text)
  if (toType === 'status' || toType === 'select') {
    if (isBoolType(fromType)) { out.value_text = fv?.value_boolean === true ? 'Done' : null; return out }
    out.value_text = toCanonicalText(fromType, fv)
    return out
  }

  // → number / currency / rating
  if (isNumType(toType)) {
    if (isNumType(fromType)) { out.value_number = fv?.value_number ?? null; return out }
    const t = toCanonicalText(fromType, fv)
    if (t == null) return out
    const n = Number(t.replace(/[$,£€\s]/g, ''))
    out.value_number = Number.isFinite(n) ? n : null
    return out
  }

  // → date / datetime
  if (isDateType(toType)) {
    if (isDateType(fromType)) { out.value_date = fv?.value_date ?? null; return out }
    const t = toCanonicalText(fromType, fv)
    if (t == null) return out
    const ms = Date.parse(t)
    out.value_date = Number.isNaN(ms) ? null : new Date(ms).toISOString()
    return out
  }

  // → multiselect / tags
  if (isListType(toType)) {
    if (isListType(fromType)) { out.value_json = Array.isArray(fv?.value_json) ? fv!.value_json : null; return out }
    const t = toCanonicalText(fromType, fv)
    if (t == null) return out
    const arr = t.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
    out.value_json = arr.length ? arr : null
    return out
  }

  // → text-ish (text/textarea/email/phone/url/relation/formula/user)
  out.value_text = toCanonicalText(fromType, fv)
  return out
}

/** True when a value holds nothing across all storage columns. */
export function valueIsEmpty(fv?: FieldValueLike | null): boolean {
  if (!fv) return true
  const jsonEmpty = fv.value_json == null || (Array.isArray(fv.value_json) && fv.value_json.length === 0)
  return fv.value_text == null && fv.value_number == null && fv.value_boolean == null && fv.value_date == null && jsonEmpty
}

/** Count how many non-empty source values would be lost converting from→to. */
export function countConversionLoss(fromType: string, toType: string, values: FieldValueLike[]): { total: number; lost: number } {
  let total = 0
  let lost = 0
  for (const fv of values) {
    if (valueIsEmpty(fv)) continue
    total++
    if (valueIsEmpty(convertFieldValue(fromType, toType, fv))) lost++
  }
  return { total, lost }
}
