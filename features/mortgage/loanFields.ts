// ─────────────────────────────────────────────────────────────────────────
// Phase D3-LP — canonical Loan & Property field schema.
//
// One source of truth for the Loan & Property Info tab (Arrive-style). The tab
// renderer maps over this; provisioning (ensureLoanPropertyFields) creates any
// missing fields on the loan board by slug, HIDDEN from the board grid so they
// power the card without cluttering the table. Slugs deliberately reuse the ones
// the Overview already binds (loan_amount, note_rate, credit_score,
// property_address, property_value, target_close_date, lock_*) so data entered
// here shows up there. Computed entries are display-only — never provisioned,
// derived live from entered values (not fabricated).
// ─────────────────────────────────────────────────────────────────────────

import type { FieldType } from '@/types/database'

export type LoanFieldUiType = 'currency' | 'number' | 'percent' | 'select' | 'boolean' | 'text' | 'date'
export type LoanSubtab = 'loan' | 'property' | 'title'
export type ComputedKey = 'total_loan_amount' | 'ltv' | 'cltv' | 'hcltv' | 'total_piti'

export interface LoanField {
  slug: string
  label: string
  type: LoanFieldUiType
  subtab: LoanSubtab
  section: string
  options?: string[]
  required?: boolean
  refiOnly?: boolean
  unit?: '%' | 'months'
  computed?: ComputedKey
  default?: string
  sensitive?: boolean // SEC-LOCK — locked until secure storage exists (none set today)
}

/** UI percent maps to a numeric DB column; everything else is 1:1. */
export function dbFieldType(t: LoanFieldUiType): FieldType {
  return t === 'percent' ? 'number' : t
}

// ── Loan Info ───────────────────────────────────────────────────────────────
const LOAN_INFO: LoanField[] = [
  { slug: 'loan_purpose',          label: 'Loan Purpose',           type: 'select', subtab: 'loan', section: 'Loan Info', options: ['Purchase', 'Refinance'], default: 'Purchase' },
  { slug: 'appraised_value',       label: 'Appraised Value',        type: 'currency', subtab: 'loan', section: 'Loan Info', required: true },
  { slug: 'loan_amount',           label: 'Base Loan Amount',       type: 'currency', subtab: 'loan', section: 'Loan Info', required: true },
  { slug: 'ltv',                   label: 'LTV',                    type: 'percent', subtab: 'loan', section: 'Loan Info', required: true, computed: 'ltv' },
  { slug: 'refinance_type',        label: 'Refinance Type',         type: 'select', subtab: 'loan', section: 'Loan Info', refiOnly: true, options: ['Rate/Term', 'Cash-Out', 'Streamline'] },
  { slug: 'existing_liens_amount', label: 'Existing Liens Amount',  type: 'currency', subtab: 'loan', section: 'Loan Info', refiOnly: true },
  { slug: 'refinance_program',     label: 'Refinance Program',      type: 'select', subtab: 'loan', section: 'Loan Info', refiOnly: true, options: ['Full Doc', 'Streamline', 'Alt Doc'] },
  { slug: 'mortgage_type',         label: 'Mortgage Type',          type: 'select', subtab: 'loan', section: 'Loan Info', required: true, options: ['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'Non-QM'] },
  { slug: 'lien_position',         label: 'Lien Position',          type: 'select', subtab: 'loan', section: 'Loan Info', required: true, options: ['First Lien', 'Second Lien'] },
  { slug: 'total_loan_amount',     label: 'Total Loan Amount',      type: 'currency', subtab: 'loan', section: 'Loan Info', computed: 'total_loan_amount' },
  { slug: 'subordinate_liens',     label: 'Subordinate Liens',      type: 'boolean', subtab: 'loan', section: 'Loan Info' },
  { slug: 'cltv',                  label: 'CLTV',                   type: 'percent', subtab: 'loan', section: 'Loan Info', computed: 'cltv' },
  { slug: 'hcltv',                 label: 'HCLTV',                  type: 'percent', subtab: 'loan', section: 'Loan Info', computed: 'hcltv' },
  { slug: 'amortization_type',     label: 'Amortization Type',      type: 'select', subtab: 'loan', section: 'Loan Info', options: ['Fixed', 'ARM'] },
  { slug: 'note_rate',             label: 'Note Rate',              type: 'percent', subtab: 'loan', section: 'Loan Info' },
  { slug: 'qualifying_rate',       label: 'Qualifying Rate',        type: 'percent', subtab: 'loan', section: 'Loan Info' },
  { slug: 'interest_rate_buydown', label: 'Interest Rate Buydown',  type: 'select', subtab: 'loan', section: 'Loan Info', options: ['None', '3-2-1', '2-1', '1-0'] },
  { slug: 'amortization_term',     label: 'Amortization Term',      type: 'number', subtab: 'loan', section: 'Loan Info', required: true, unit: 'months', default: '360' },
  { slug: 'interest_only',         label: 'Interest Only',          type: 'boolean', subtab: 'loan', section: 'Loan Info' },
  { slug: 'impound_waiver',        label: 'Impound Waiver',         type: 'select', subtab: 'loan', section: 'Loan Info', options: ['None Waived', 'Taxes Waived', 'Insurance Waived', 'Both Waived'] },
  { slug: 'credit_score',          label: 'Loan FICO',              type: 'number', subtab: 'loan', section: 'Loan Info' },
  { slug: 'no_fico',               label: 'No FICO',                type: 'boolean', subtab: 'loan', section: 'Loan Info' },
  { slug: 'net_tangible_benefit',  label: 'Net Tangible Benefit',   type: 'select', subtab: 'loan', section: 'Loan Info', refiOnly: true, options: ['Lower Rate', 'Lower Payment', 'Cash in Hand', 'Shorter Term'] },
]

// ── Loan Details (right column, below the PITI table) ──────────────────────────
const LOAN_DETAILS: LoanField[] = [
  { slug: 'properties_financed',         label: 'Properties Financed',          type: 'number',   subtab: 'loan', section: 'Loan Details' },
  { slug: 'projected_reserve_lpa',       label: 'Projected Reserve Amount (LPA)', type: 'currency', subtab: 'loan', section: 'Loan Details' },
  { slug: 'reserves_months',             label: 'Reserves',                     type: 'number',   subtab: 'loan', section: 'Loan Details', unit: 'months' },
  { slug: 'improvements_renovations',    label: 'Improvements, Renovations, and Repairs', type: 'currency', subtab: 'loan', section: 'Loan Details' },
  { slug: 'community_lending_product',   label: 'Community Lending Product',     type: 'select',   subtab: 'loan', section: 'Loan Details', options: ['None', 'HomeReady', 'Home Possible'] },
  { slug: 'product_description_aus',     label: 'Product Description (AUS/DU)',  type: 'text',     subtab: 'loan', section: 'Loan Details' },
  { slug: 'positive_rental_history',     label: 'Positive Rental Payment History', type: 'select', subtab: 'loan', section: 'Loan Details', options: ['Yes', 'No'] },
  { slug: 'owner_existing_mortgage_aus', label: 'Owner of existing Mortgage (AUS/DU)', type: 'select', subtab: 'loan', section: 'Loan Details', options: ['Fannie Mae', 'Freddie Mac', 'Unknown'] },
  { slug: 'lpa_offering',                label: 'LPA Offering',                 type: 'boolean',  subtab: 'loan', section: 'Loan Details' },
  { slug: 'business_purpose_loan',       label: 'Business Purpose Loan',        type: 'boolean',  subtab: 'loan', section: 'Loan Details' },
  { slug: 'alternate_doc_loan',          label: 'Alternate Doc Loan',           type: 'boolean',  subtab: 'loan', section: 'Loan Details' },
  { slug: 'settlement_credits',          label: 'Settlement Credits',           type: 'currency', subtab: 'loan', section: 'Loan Details' },
]

// ── Lock (ties to the Overview lock chip) ─────────────────────────────────────
const LOCK_INFO: LoanField[] = [
  { slug: 'lock_status',     label: 'Lock Status',     type: 'select', subtab: 'loan', section: 'Lock', options: ['Floating', 'Locked'] },
  { slug: 'lock_expiration', label: 'Lock Expiration', type: 'date',   subtab: 'loan', section: 'Lock' },
  { slug: 'lender',          label: 'Lender / Investor', type: 'text', subtab: 'loan', section: 'Lock' },
]

// ── Property Info ─────────────────────────────────────────────────────────────
const PROPERTY_INFO: LoanField[] = [
  { slug: 'property_address', label: 'Street Address', type: 'text',   subtab: 'property', section: 'Property' },
  { slug: 'property_city',    label: 'City',           type: 'text',   subtab: 'property', section: 'Property' },
  { slug: 'property_state',   label: 'State',          type: 'text',   subtab: 'property', section: 'Property' },
  { slug: 'property_zip',     label: 'Zip Code',       type: 'text',   subtab: 'property', section: 'Property' },
  { slug: 'property_county',  label: 'County',         type: 'text',   subtab: 'property', section: 'Property' },
  { slug: 'property_type',    label: 'Property Type',  type: 'select', subtab: 'property', section: 'Property', options: ['Single Family Detached', 'Condo', 'Townhouse', '2-4 Unit', 'Manufactured', 'PUD'] },
  { slug: 'occupancy',        label: 'Occupancy',      type: 'select', subtab: 'property', section: 'Property', options: ['Primary Residence', 'Second Home', 'Investment'] },
  { slug: 'property_value',   label: 'Estimated Value', type: 'currency', subtab: 'property', section: 'Property' },
  { slug: 'units',            label: 'Units',          type: 'number', subtab: 'property', section: 'Property' },
  { slug: 'year_built',       label: 'Year Built',     type: 'number', subtab: 'property', section: 'Property' },
]

// ── Title Info ────────────────────────────────────────────────────────────────
const TITLE_INFO: LoanField[] = [
  { slug: 'title_company',      label: 'Title Company',  type: 'text', subtab: 'title', section: 'Title' },
  { slug: 'title_vesting',      label: 'Vesting',        type: 'text', subtab: 'title', section: 'Title' },
  { slug: 'title_file_number',  label: 'Title File #',   type: 'text', subtab: 'title', section: 'Title' },
  { slug: 'target_close_date',  label: 'Estimated Closing Date', type: 'date', subtab: 'title', section: 'Title' },
]

export const LOAN_FIELDS: LoanField[] = [
  ...LOAN_INFO, ...LOAN_DETAILS, ...LOCK_INFO, ...PROPERTY_INFO, ...TITLE_INFO,
]

// ── Proposed Monthly Payment rows (multi-column; each carries a monthly value) ──
export interface PitiRow { slug: string; label: string }
export const PITI_ROWS: PitiRow[] = [
  { slug: 'piti_first_mortgage',   label: 'First Mortgage' },
  { slug: 'piti_other_financing',  label: 'Other Financing' },
  { slug: 'piti_hoi',              label: 'HOI' },
  { slug: 'piti_supplemental',     label: 'Supplemental' },
  { slug: 'piti_property_taxes',   label: 'Property Taxes' },
  { slug: 'piti_mi',               label: 'MI' },
  { slug: 'piti_association_dues', label: 'Association Dues' },
  { slug: 'piti_other',            label: 'Other' },
]

/** Everything that gets a real, persisted board field (computed cells excluded). */
export function provisionableLoanFields(): { slug: string; label: string; type: FieldType; options?: string[] }[] {
  const fromSchema = LOAN_FIELDS.filter((f) => !f.computed).map((f) => ({
    slug: f.slug, label: f.label, type: dbFieldType(f.type), options: f.options,
  }))
  const fromPiti = PITI_ROWS.map((r) => ({ slug: r.slug, label: `Payment · ${r.label}`, type: 'currency' as FieldType }))
  return [...fromSchema, ...fromPiti]
}
