// ─────────────────────────────────────────────────────────────────────────
// Common field registry — pure helpers (Phase 36B).
//
// Identity only: which fields across boards represent the same logical data.
// The type-compatibility matrix and the backfill allowlist here MUST stay in
// sync with the SQL versions in 20260623000000_phase36b_common_field_keys.sql.
// No value movement happens in 36B.
// ─────────────────────────────────────────────────────────────────────────

export type CommonFieldScope = 'person' | 'loan' | 'organization' | 'team' | 'custom'
export type CommonFieldDataType = 'text' | 'email' | 'phone' | 'currency' | 'number' | 'date' | 'select' | 'boolean' | 'url'

export type CommonFieldKey = {
  id: string
  organization_id: string
  key: string
  label: string
  data_type: CommonFieldDataType
  scope: CommonFieldScope
}

export const SCOPE_LABELS: Record<CommonFieldScope, string> = {
  person: 'Person',
  loan: 'Loan',
  organization: 'Organization',
  team: 'Team',
  custom: 'Custom',
}

/**
 * Decision 4 — type-compatibility matrix.
 *   - exact match (field_type === data_type) always allowed
 *   - a `text` field may link to text / email / phone / url keys
 *   - everything else is rejected (no number↔currency, date↔text, select↔text…)
 */
export function isTypeCompatible(fieldType: string, dataType: string): boolean {
  if (fieldType === dataType) return true
  if (fieldType === 'text' && (dataType === 'text' || dataType === 'email' || dataType === 'phone' || dataType === 'url')) return true
  return false
}

/** Checklist fields and the default workflow status field are never eligible. */
export function isFieldEligibleForCommon(field: { field_type?: string; is_default_status?: boolean }): boolean {
  return field.field_type !== 'checklist' && field.is_default_status !== true
}

/** Decision 3 — exact, case-insensitive, trimmed name → key allowlist. */
export const COMMON_KEY_ALLOWLIST: Record<string, string> = {
  email: 'email',
  'e-mail': 'email',
  phone: 'phone',
  mobile_phone: 'phone',
  borrower_phone: 'phone',
  cell: 'phone',
  name: 'name',
  full_name: 'name',
  borrower_name: 'name',
  loan_amount: 'loan_amount',
  amount: 'loan_amount',
  preapproved_amount: 'loan_amount',
  property_address: 'property_address',
  address: 'property_address',
  loan_type: 'loan_type',
  lead_source: 'lead_source',
  assigned_lo: 'assigned_lo',
  loan_officer: 'assigned_lo',
}

/** Resolve the allowlisted key for a raw field name (or null). */
export function allowlistKeyForName(name: string): string | null {
  return COMMON_KEY_ALLOWLIST[name.trim().toLowerCase()] ?? null
}
