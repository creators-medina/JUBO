// ─────────────────────────────────────────────────────────────────────────
// Type inference + value coercion. Framework-agnostic (used on client for
// mapping suggestions AND on server for insert coercion). No mortgage logic.
// ─────────────────────────────────────────────────────────────────────────

import type { FieldType } from '@/types/database'
import type { InferredType } from '../types'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^[+]?[\d][\d\s().-]{6,}$/
const URL_RE = /^(https?:\/\/|www\.)\S+$/i
const CURRENCY_RE = /^[$€£]\s?-?[\d,]+(\.\d+)?$|^-?[\d,]+\.\d{2}$/
const BOOL_VALUES = new Set(['true', 'false', 'yes', 'no', 'y', 'n'])

function isDateLike(v: string): boolean {
  if (/^\d+$/.test(v)) return false // pure integers aren't dates
  if (/^\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/.test(v)) return true
  const t = Date.parse(v)
  return !Number.isNaN(t) && /[a-zA-Z]|[/-]/.test(v)
}

function stripNumber(v: string): string {
  return v.replace(/[$€£,\s]/g, '')
}

/** Infer the most likely field type for a column from its sample values. */
export function inferColumnType(samples: string[]): InferredType {
  const vals = samples.map((s) => `${s ?? ''}`.trim()).filter((s) => s !== '')
  if (vals.length === 0) return { type: 'text', confidence: 0 }

  const score = (pred: (v: string) => boolean) => vals.filter(pred).length / vals.length

  const checks: { type: FieldType; conf: number }[] = [
    { type: 'email', conf: score((v) => EMAIL_RE.test(v)) },
    { type: 'url', conf: score((v) => URL_RE.test(v)) },
    { type: 'currency', conf: score((v) => CURRENCY_RE.test(v) || /^[$€£]/.test(v)) },
    { type: 'phone', conf: score((v) => PHONE_RE.test(v) && stripNumber(v).replace(/\D/g, '').length >= 7) },
    { type: 'date', conf: score(isDateLike) },
    { type: 'boolean', conf: score((v) => BOOL_VALUES.has(v.toLowerCase())) },
    { type: 'number', conf: score((v) => /^-?[\d,]+(\.\d+)?$/.test(v) && stripNumber(v) !== '') },
  ]

  const best = checks.sort((a, b) => b.conf - a.conf)[0]
  if (best && best.conf >= 0.6) return { type: best.type, confidence: best.conf }
  return { type: 'text', confidence: 0.5 }
}

// ── Coercion ──────────────────────────────────────────────────────────────

export type FieldValuePatch = {
  value_text?: string | null
  value_number?: number | null
  value_boolean?: boolean | null
  value_date?: string | null
  value_json?: unknown
}

/** Coerce a raw cell string into the right field_values column for a field type. */
export function coerceValue(raw: string, fieldType: FieldType): FieldValuePatch | null {
  const v = `${raw ?? ''}`.trim()
  if (v === '') return null

  switch (fieldType) {
    case 'number':
    case 'currency':
    case 'rating': {
      const n = Number(stripNumber(v))
      return Number.isFinite(n) ? { value_number: n } : null
    }
    case 'boolean': {
      const low = v.toLowerCase()
      if (['true', 'yes', 'y', '1'].includes(low)) return { value_boolean: true }
      if (['false', 'no', 'n', '0'].includes(low)) return { value_boolean: false }
      return null
    }
    case 'date':
    case 'datetime': {
      const t = Date.parse(v)
      return Number.isNaN(t) ? { value_text: v } : { value_date: new Date(t).toISOString() }
    }
    case 'multiselect':
    case 'tags': {
      const parts = v.split(/[,;|]/).map((s) => s.trim()).filter(Boolean)
      return { value_json: parts }
    }
    case 'select':
    case 'status':
      // Single-select / status store the label in value_text so the in-app cell
      // editor and the imported value read the same column (multiselect → value_json).
      return { value_text: v }
    default:
      return { value_text: v }
  }
}
