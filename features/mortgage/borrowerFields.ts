// ─────────────────────────────────────────────────────────────────────────
// Phase D3-BI — canonical Borrower field schema (Arrive 1003-style).
//
// Drives the Borrower Info tab across four sub-tabs. Values are stored per
// borrower in record_borrowers.data (JSONB, keyed by slug) — NOT in field_values
// (a record can have several borrowers). The primary borrower's `email` and
// `cell_phone` are mirrored into the record's phone/email field_values by the
// save action so the header Call/Email + SMS composer keep working.
// ─────────────────────────────────────────────────────────────────────────

export type BorrowerFieldType = 'text' | 'number' | 'select' | 'boolean' | 'date' | 'ssn'
export type BorrowerSubtab = 'basic' | 'declarations' | 'demographics' | 'additional'
export type BorrowerComputed = 'age'

export interface BorrowerField {
  slug: string
  label: string
  type: BorrowerFieldType
  subtab: BorrowerSubtab
  section: string
  options?: string[]
  required?: boolean
  computed?: BorrowerComputed
  full?: boolean // span full width
}

const BASIC: BorrowerField[] = [
  // Personal Info
  { slug: 'econsent_authorized',    label: 'eConsent Authorized',    type: 'boolean', subtab: 'basic', section: 'Personal Info' },
  { slug: 'credit_pull_authorized', label: 'Credit Pull Authorized', type: 'boolean', subtab: 'basic', section: 'Personal Info' },
  { slug: 'first_name',  label: 'First Name', type: 'text', subtab: 'basic', section: 'Personal Info', required: true },
  { slug: 'middle_name', label: 'Middle',     type: 'text', subtab: 'basic', section: 'Personal Info' },
  { slug: 'last_name',   label: 'Last Name',  type: 'text', subtab: 'basic', section: 'Personal Info', required: true },
  { slug: 'suffix',      label: 'Suffix',     type: 'text', subtab: 'basic', section: 'Personal Info' },
  { slug: 'ssn_itin',    label: 'SSN / ITIN', type: 'ssn',  subtab: 'basic', section: 'Personal Info', required: true },
  { slug: 'date_of_birth', label: 'Date of Birth', type: 'date', subtab: 'basic', section: 'Personal Info', required: true },
  { slug: 'age',         label: 'Age', type: 'number', subtab: 'basic', section: 'Personal Info', computed: 'age' },
  { slug: 'residency_type', label: 'Residency Type', type: 'select', subtab: 'basic', section: 'Personal Info', required: true, options: ['US Citizen', 'Permanent Resident', 'Non-Permanent Resident'] },
  { slug: 'marital_status', label: 'Marital Status', type: 'select', subtab: 'basic', section: 'Personal Info', required: true, options: ['Married', 'Unmarried', 'Separated'] },
  { slug: 'email',       label: 'Email',      type: 'text', subtab: 'basic', section: 'Personal Info', required: true },
  { slug: 'cell_phone',  label: 'Cell Phone', type: 'text', subtab: 'basic', section: 'Personal Info', required: true },
  { slug: 'work_phone',  label: 'Work Phone', type: 'text', subtab: 'basic', section: 'Personal Info' },
  { slug: 'work_phone_ext', label: 'Work Ext', type: 'text', subtab: 'basic', section: 'Personal Info' },
  { slug: 'home_phone',  label: 'Home Phone', type: 'text', subtab: 'basic', section: 'Personal Info' },
  { slug: 'dependents_count', label: 'No. of Dependents', type: 'number', subtab: 'basic', section: 'Personal Info' },
  { slug: 'dependents_ages',  label: 'Dependents Ages',   type: 'text', subtab: 'basic', section: 'Personal Info' },
  { slug: 'estimated_credit_score', label: 'Estimated Credit Score', type: 'number', subtab: 'basic', section: 'Personal Info' },
  { slug: 'nickname', label: 'Nickname', type: 'text', subtab: 'basic', section: 'Personal Info' },
  // Address
  { slug: 'current_address',   label: 'Current Address', type: 'text', subtab: 'basic', section: 'Address', required: true, full: true },
  { slug: 'housing_status',    label: 'Housing Status',  type: 'select', subtab: 'basic', section: 'Address', required: true, options: ['Own', 'Rent', 'No primary housing expense'] },
  { slug: 'years_at_address',  label: 'Years at Address',  type: 'number', subtab: 'basic', section: 'Address', required: true },
  { slug: 'months_at_address', label: 'Months at Address', type: 'number', subtab: 'basic', section: 'Address', required: true },
  { slug: 'mailing_differs',   label: 'Mailing address is NOT the same as current', type: 'boolean', subtab: 'basic', section: 'Address', full: true },
  { slug: 'previous_address',  label: 'Previous Address', type: 'text', subtab: 'basic', section: 'Address', full: true },
]

// Standard 1003 declarations (yes/no).
const DECLARATIONS: BorrowerField[] = [
  { slug: 'decl_primary_residence',   label: 'Will you occupy the property as your primary residence?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_ownership_3yrs',      label: 'Ownership interest in a property in the last 3 years?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_borrowing_down',      label: 'Borrowing money for this transaction (not the mortgage)?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_other_mortgage',      label: 'Applying for another mortgage on another property?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_new_credit',          label: 'Applying for new credit before closing?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_clean_energy_lien',   label: 'Property subject to a clean-energy (PACE) lien?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_cosigner',            label: 'Co-signer or guarantor on undisclosed debt?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_outstanding_judgments', label: 'Outstanding judgments against you?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_delinquent_federal',  label: 'Delinquent or in default on federal debt?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_party_to_lawsuit',    label: 'Party to a lawsuit that may result in a lien?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_conveyed_title',      label: 'Conveyed title in lieu of foreclosure (last 7 yrs)?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_short_sale',          label: 'Completed a pre-foreclosure/short sale (last 7 yrs)?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_foreclosure',         label: 'Property foreclosed upon (last 7 yrs)?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_bankruptcy',          label: 'Declared bankruptcy (last 7 yrs)?', type: 'boolean', subtab: 'declarations', section: 'Declarations' },
  { slug: 'decl_bankruptcy_type',     label: 'Bankruptcy Type', type: 'select', subtab: 'declarations', section: 'Declarations', options: ['Chapter 7', 'Chapter 11', 'Chapter 12', 'Chapter 13'] },
]

// HMDA demographics.
const DEMOGRAPHICS: BorrowerField[] = [
  { slug: 'demo_ethnicity', label: 'Ethnicity', type: 'select', subtab: 'demographics', section: 'Demographic Information', options: ['Hispanic or Latino', 'Not Hispanic or Latino', 'Do not wish to provide'] },
  { slug: 'demo_race',      label: 'Race',      type: 'select', subtab: 'demographics', section: 'Demographic Information', options: ['American Indian or Alaska Native', 'Asian', 'Black or African American', 'Native Hawaiian or Other Pacific Islander', 'White', 'Do not wish to provide'] },
  { slug: 'demo_sex',       label: 'Sex',       type: 'select', subtab: 'demographics', section: 'Demographic Information', options: ['Female', 'Male', 'Do not wish to provide'] },
  { slug: 'demo_collected_method', label: 'Collected by', type: 'select', subtab: 'demographics', section: 'Demographic Information', options: ['Face-to-face', 'Telephone', 'Email/Internet', 'Mail'] },
]

const ADDITIONAL: BorrowerField[] = [
  { slug: 'add_first_time_buyer',   label: 'First-time homebuyer?', type: 'boolean', subtab: 'additional', section: 'Additional Questions' },
  { slug: 'add_military_service',   label: 'Military service?', type: 'select', subtab: 'additional', section: 'Additional Questions', options: ['None', 'Currently serving', 'Veteran', 'Surviving spouse'] },
  { slug: 'add_homebuyer_education', label: 'Completed homebuyer education?', type: 'boolean', subtab: 'additional', section: 'Additional Questions' },
  { slug: 'add_language_preference', label: 'Language preference', type: 'select', subtab: 'additional', section: 'Additional Questions', options: ['English', 'Spanish', 'Chinese', 'Vietnamese', 'Korean', 'Tagalog', 'Other'] },
]

export const BORROWER_FIELDS: BorrowerField[] = [...BASIC, ...DECLARATIONS, ...DEMOGRAPHICS, ...ADDITIONAL]

export const BORROWER_SUBTABS: { key: BorrowerSubtab; label: string }[] = [
  { key: 'basic', label: 'Basic Details' },
  { key: 'declarations', label: 'Declarations' },
  { key: 'demographics', label: 'Demographics' },
  { key: 'additional', label: 'Additional Questions' },
]

/** A new borrower's display label from its data (falls back to the slot index). */
export function borrowerName(data: Record<string, unknown>, index: number): string {
  const n = [data.first_name, data.last_name].filter(Boolean).join(' ').trim()
  return n || (index === 0 ? 'Primary Borrower' : `Borrower ${index + 1}`)
}
