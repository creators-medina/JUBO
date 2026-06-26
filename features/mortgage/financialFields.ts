// ─────────────────────────────────────────────────────────────────────────
// Phase D3-FI — canonical Financial line-item schema (Arrive 1003-style).
//
// Each category (income / asset / liability / reo) is a repeatable item stored
// in record_financial_items.data (JSONB by slug). Section totals are derived
// from these (sums) and mirrored to the record. No fabrication; DTI (income vs
// debt ratio) is deferred to D2 — this layer only produces the raw totals.
// ─────────────────────────────────────────────────────────────────────────

export type FinFieldType = 'text' | 'number' | 'currency' | 'select' | 'boolean' | 'date'
export type FinCategory = 'income' | 'asset' | 'liability' | 'reo'

export interface FinField {
  slug: string
  label: string
  type: FinFieldType
  options?: string[]
  full?: boolean
  computed?: 'income_monthly_total'
  sensitive?: boolean // SEC-LOCK — locked until secure storage exists (no write/no display)
}

export interface FinCategoryDef {
  key: FinCategory
  label: string          // section heading
  addLabel: string       // "+ Income"
  borrowerLinked: boolean // income/liability tie to a borrower
  amountSlug: string      // the per-item field summed into the section total
  fields: FinField[]
  summaryFields: string[] // slugs shown on the collapsed item row
}

const INCOME: FinField[] = [
  { slug: 'income_type', label: 'Income Type', type: 'select', options: ['Base Employment Income', 'Bonus', 'Overtime', 'Commission', 'Self-Employment', 'Social Security', 'Pension / Retirement', 'Rental Income', 'Other'] },
  { slug: 'current', label: 'Current', type: 'boolean' },
  { slug: 'primary', label: 'Primary', type: 'boolean' },
  { slug: 'self_employed', label: 'Business owner or Self-Employed', type: 'boolean' },
  { slug: 'pay_type', label: 'Pay Type', type: 'select', options: ['Salary', 'Hourly'] },
  { slug: 'employer_name', label: 'Employer or Business Name', type: 'text', full: true },
  { slug: 'employer_address', label: 'Employer Address', type: 'text', full: true },
  { slug: 'position_title', label: 'Position or Title', type: 'text' },
  { slug: 'employer_contact', label: 'Employer Contact No.', type: 'text' },
  { slug: 'start_date', label: 'Start Date', type: 'date' },
  { slug: 'end_date', label: 'End Date', type: 'date' },
  // Gross Monthly Income
  { slug: 'base_income', label: 'Base Income', type: 'currency' },
  { slug: 'bonus', label: 'Bonus', type: 'currency' },
  { slug: 'commissions', label: 'Commissions', type: 'currency' },
  { slug: 'overtime', label: 'Overtime', type: 'currency' },
  { slug: 'other_income', label: 'Other', type: 'currency' },
  { slug: 'monthly_total', label: 'Monthly Total', type: 'currency', computed: 'income_monthly_total' },
  { slug: 'seasonal_income', label: 'Seasonal Income', type: 'boolean' },
  { slug: 'foreign_income', label: 'Foreign Income', type: 'boolean' },
  { slug: 'employed_by_family', label: 'Employed by a family member, property seller, or real estate agent', type: 'boolean', full: true },
]

const ASSET: FinField[] = [
  { slug: 'asset_type', label: 'Asset Type', type: 'select', options: ['Checking', 'Savings', 'Money Market', 'Certificate of Deposit', 'Retirement', 'Brokerage / Stocks', 'Gift', 'Other'] },
  { slug: 'cash_market_value', label: 'Cash or Market Value', type: 'currency' },
  { slug: 'bank_institution', label: 'Bank / Institution', type: 'text', full: true },
  { slug: 'account_number', label: 'Account Number', type: 'text', sensitive: true },
  { slug: 'is_verified', label: 'Is Verified', type: 'boolean' },
  { slug: 'liquidity', label: 'Liquidity', type: 'boolean' },
]

const LIABILITY: FinField[] = [
  { slug: 'liability_type', label: 'Liability Type', type: 'select', options: ['Mortgage Loan', 'Revolving (Credit Card)', 'Installment', 'Lease', 'HELOC', 'Open 30-Day', 'Other'] },
  { slug: 'creditor_name', label: 'Creditor Name', type: 'text', full: true },
  { slug: 'mortgage_type', label: 'Mortgage Type', type: 'select', options: ['Conventional', 'FHA', 'VA', 'USDA', 'Other'] },
  { slug: 'lien_position', label: 'Lien Position', type: 'select', options: ['First Lien', 'Second Lien'] },
  { slug: 'unpaid_balance', label: 'Unpaid Balance', type: 'currency' },
  { slug: 'monthly_payment', label: 'Monthly Payment', type: 'currency' },
  { slug: 'remaining_months', label: 'Remaining Months', type: 'number' },
  { slug: 'account_number', label: 'Account Number', type: 'text', sensitive: true },
  { slug: 'account_status', label: 'Account Status', type: 'select', options: ['Open', 'Closed', 'Paid', 'Collection'] },
  { slug: 'current_rating_type', label: 'Current Rating Type', type: 'select', options: ['Current', '30 Days Late', '60 Days Late', '90+ Days Late'] },
  { slug: 'will_be_paid_off', label: 'Will be paid off', type: 'boolean' },
  { slug: 'omitted', label: 'Omitted', type: 'boolean' },
  { slug: 're_subordinate', label: 'Re-Subordinate', type: 'boolean' },
  { slug: 'derogatory', label: 'Derogatory', type: 'boolean' },
  { slug: 'hoi_escrowed', label: 'HOI Escrowed', type: 'boolean' },
  { slug: 'property_taxes_escrowed', label: 'Property Taxes Escrowed', type: 'boolean' },
]

const REO: FinField[] = [
  { slug: 'reo_address', label: 'Property Address', type: 'text', full: true },
  { slug: 'reo_status', label: 'Status', type: 'select', options: ['Retain', 'Sell', 'Pending Sale', 'Sold'] },
  { slug: 'reo_occupancy', label: 'Occupancy', type: 'select', options: ['Primary Residence', 'Second Home', 'Investment'] },
  { slug: 'reo_market_value', label: 'Market Value', type: 'currency' },
  { slug: 'reo_monthly_payment', label: 'Monthly Payment', type: 'currency' },
  { slug: 'reo_liens', label: 'Liens / Unpaid Balance', type: 'currency' },
  { slug: 'reo_gross_rental', label: 'Gross Rental Income', type: 'currency' },
]

export const FIN_CATEGORIES: FinCategoryDef[] = [
  { key: 'income',    label: 'Monthly Income',    addLabel: '+ Income',    borrowerLinked: true,  amountSlug: 'monthly_total',    fields: INCOME,    summaryFields: ['income_type', 'employer_name'] },
  { key: 'asset',     label: 'Total Assets',      addLabel: '+ Asset',     borrowerLinked: false, amountSlug: 'cash_market_value', fields: ASSET,    summaryFields: ['asset_type', 'bank_institution'] },
  { key: 'liability', label: 'Monthly Liability', addLabel: '+ Liability', borrowerLinked: true,  amountSlug: 'monthly_payment',  fields: LIABILITY, summaryFields: ['liability_type', 'creditor_name'] },
  { key: 'reo',       label: 'Real Estate Owned', addLabel: '+ REO',       borrowerLinked: false, amountSlug: 'reo_market_value',  fields: REO,       summaryFields: ['reo_address', 'reo_status'] },
]

export function catDef(key: FinCategory): FinCategoryDef {
  return FIN_CATEGORIES.find((c) => c.key === key)!
}

/** An income item's monthly total = base + bonus + commissions + overtime + other. */
export function incomeMonthlyTotal(data: Record<string, unknown>): number {
  const n = (k: string) => (typeof data[k] === 'number' ? (data[k] as number) : 0)
  return n('base_income') + n('bonus') + n('commissions') + n('overtime') + n('other_income')
}

/** The amount a single item contributes to its section total. */
export function itemAmount(category: FinCategory, data: Record<string, unknown>): number {
  if (category === 'income') return incomeMonthlyTotal(data)
  const slug = catDef(category).amountSlug
  const v = data[slug]
  return typeof v === 'number' ? v : 0
}
