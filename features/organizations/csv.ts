// Pure CSV helpers for org data export — no side effects, unit-testable.

/** RFC-4180-ish CSV cell escaping (quote when the cell contains , " CR or LF). */
export function escapeCsvCell(v: string | number | null | undefined): string {
  if (v == null) return ''
  const s = String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Render a header + rows to CSV text (CRLF line endings). */
export function toCsv(header: string[], rows: (string | number | null)[][]): string {
  return [header, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\r\n')
}

/** Flatten a typed field_value row to a single display string. */
export function fieldValueToString(fv: {
  value_text?: string | null
  value_number?: number | null
  value_boolean?: boolean | null
  value_date?: string | null
  value_json?: unknown
}): string {
  if (fv.value_text != null && fv.value_text !== '') return fv.value_text
  if (fv.value_number != null) return String(fv.value_number)
  if (fv.value_boolean != null) return fv.value_boolean ? 'true' : 'false'
  if (fv.value_date) return fv.value_date
  if (fv.value_json != null) return Array.isArray(fv.value_json) ? fv.value_json.join('; ') : JSON.stringify(fv.value_json)
  return ''
}

/** Best-effort person name from a profile row. */
export function fullName(p?: { first_name?: string | null; last_name?: string | null; email?: string | null } | null): string {
  if (!p) return ''
  const n = [p.first_name, p.last_name].filter(Boolean).join(' ').trim()
  return n || p.email || ''
}
