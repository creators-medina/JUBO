// ─────────────────────────────────────────────────────────────────────────
// Field accessors — read values from the generic field_values store by slug,
// so mortgage sections don't care how fields are stored. Pure helpers.
// ─────────────────────────────────────────────────────────────────────────

import type { MortgageData } from './types'

function fieldBySlug(data: MortgageData, slug: string) {
  return data.fields.find((f) => f.slug === slug)
}

/** Raw value for a field slug (text/number/date/json/bool), or null. */
export function rawValue(data: MortgageData, slug: string): unknown {
  const field = fieldBySlug(data, slug)
  if (!field) return null
  const fv = data.fieldValues.find((v) => v.field_id === field.id)
  if (!fv) return null
  return fv.value_text ?? fv.value_number ?? fv.value_date ?? fv.value_json ?? fv.value_boolean ?? null
}

export function textValue(data: MortgageData, slug: string): string | null {
  const v = rawValue(data, slug)
  return v == null ? null : String(v)
}

export function numberValue(data: MortgageData, slug: string): number | null {
  const field = fieldBySlug(data, slug)
  if (!field) return null
  const fv = data.fieldValues.find((v) => v.field_id === field.id)
  const n = fv?.value_number
  return typeof n === 'number' ? n : null
}

export function dateValue(data: MortgageData, slug: string): string | null {
  const field = fieldBySlug(data, slug)
  if (!field) return null
  const fv = data.fieldValues.find((v) => v.field_id === field.id)
  return fv?.value_date ?? null
}

export function formatCurrency(n: number | null): string {
  if (n == null) return '—'
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}

export function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/** Days since the most recent activity/note/movement (record "freshness"). */
export function daysSinceLastTouch(data: MortgageData): number | null {
  const stamps: number[] = []
  for (const a of data.activities) if (a.created_at) stamps.push(new Date(a.created_at).getTime())
  for (const n of data.notes) if (n.created_at) stamps.push(new Date(n.created_at).getTime())
  for (const m of data.movements) if (m.created_at) stamps.push(new Date(m.created_at).getTime())
  if (stamps.length === 0) return null
  const last = Math.max(...stamps)
  return Math.floor((Date.now() - last) / 86400000)
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.ceil((t - Date.now()) / 86400000)
}

export function currentGroupName(data: MortgageData): string | null {
  return data.groups.find((g) => g.id === data.record.group_id)?.name ?? null
}
