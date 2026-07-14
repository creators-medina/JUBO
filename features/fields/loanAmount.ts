// ─────────────────────────────────────────────────────────────────────────
// Shared loan-amount resolution (Phase 5N) — DISPLAY/AGGREGATION ONLY.
//
// One source of truth for "the base loan amount of a record", used by the
// Kanban card, the board header pipeline total, and the sidebar Work Loans
// tracker so they never contradict each other. Never writes data, never
// changes schema.
//
// Resolution order (matches the contact card's intent):
//   1. the record's loan_amount FIELD value (field_values.value_number for the
//      currency field that represents the loan amount), then
//   2. the legacy records.value column (for records that only carry that), then
//   3. null → callers render "—" (NOT "$0" unless the value is genuinely 0).
//
// The loan-amount field is picked PRECISELY (not "the first currency field") so
// appraised_value / property_value are never mistaken for the loan amount.
// ─────────────────────────────────────────────────────────────────────────

import { allowlistKeyForName } from './commonFields'

type FieldLike = {
  id: string
  slug?: string | null
  name?: string | null
  field_type?: string | null
  common_field_key_id?: string | null
  is_default_status?: boolean | null
}

/**
 * Pick the field id that represents the base loan amount, in priority order:
 *   1. an explicit currency field mapped to the loan_amount common key
 *      (pass its registry id as `loanAmountKeyId` when available), then
 *   2. a field slugged exactly `loan_amount`, then
 *   3. a currency field whose NAME allowlists to `loan_amount`
 *      (loan_amount / amount / preapproved_amount), then
 *   4. LAST RESORT: the first currency common field (legacy behaviour).
 * Returns null when the board has no currency field at all.
 */
export function pickLoanAmountFieldId(fields: FieldLike[], loanAmountKeyId?: string | null): string | null {
  if (loanAmountKeyId) {
    const byKey = fields.find((f) => f.common_field_key_id === loanAmountKeyId && f.field_type === 'currency')
    if (byKey) return byKey.id
  }
  const bySlug = fields.find((f) => f.slug === 'loan_amount')
  if (bySlug) return bySlug.id

  const byName = fields.find(
    (f) => f.field_type === 'currency' && !f.is_default_status && allowlistKeyForName(f.name ?? '') === 'loan_amount',
  )
  if (byName) return byName.id

  const anyCurrency = fields.find(
    (f) => !!f.common_field_key_id && f.field_type === 'currency' && !f.is_default_status,
  )
  return anyCurrency?.id ?? null
}

/**
 * Resolve a record's loan amount from its field value + legacy column.
 * Returns a number (0 allowed when genuinely zero) or null when NO source
 * exists (so display can show "—" instead of a misleading "$0").
 */
export function resolveLoanAmount(
  fieldValueNumber: number | null | undefined,
  legacyValue: number | string | null | undefined,
): number | null {
  if (typeof fieldValueNumber === 'number' && Number.isFinite(fieldValueNumber)) return fieldValueNumber
  if (legacyValue === null || legacyValue === undefined || legacyValue === '') return null
  const v = Number(legacyValue)
  return Number.isFinite(v) ? v : null
}

/** Amount for SUMMING (nulls contribute 0). Keeps totals honest without
 *  inventing money for record-less/blank rows. */
export function loanAmountForSum(
  fieldValueNumber: number | null | undefined,
  legacyValue: number | string | null | undefined,
): number {
  return resolveLoanAmount(fieldValueNumber, legacyValue) ?? 0
}
