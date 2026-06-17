// Phase 35A — a "notes" board column is a normal field (field_type 'textarea')
// flagged via config.kind='notes'. It stores nothing in field_values; the cell
// is a presentation entry point into the existing record notes system.

export function isNotesField(field: { config?: unknown } | null | undefined): boolean {
  if (!field || typeof field !== 'object') return false
  const config = (field as { config?: { kind?: unknown } }).config
  return !!config && config.kind === 'notes'
}
