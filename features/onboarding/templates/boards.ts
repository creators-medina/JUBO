// ─────────────────────────────────────────────────────────────────────────
// Starter BOARD templates — pure data describing operationally-useful boards.
//
// These are STARTER templates: generated once at onboarding via the generic
// board engine (boards / board_groups / fields tables). The LO owns them
// afterward — rename, add groups, delete. No board logic lives here, only the
// mortgage-flavored defaults a new LO shouldn't have to build by hand.
// ─────────────────────────────────────────────────────────────────────────

import type { BoardType, FieldType } from '@/types/database'
import { LEAD_SOURCE_LABELS } from '@/features/production-plan/calc'

export type BoardFieldSpec = {
  name: string
  field_type: FieldType
  options?: string[]        // for select / multiselect
  is_required?: boolean
  config?: Record<string, unknown>   // extra field config (e.g. notes column kind)
}

// Phase 35A.1 — every starter board ships with a Notes column. It's a
// presentation field over the existing notes system (no field_values storage).
const NOTES_FIELD: BoardFieldSpec = { name: 'Notes', field_type: 'textarea', config: { kind: 'notes' } }

export type BoardGroupSpec = { name: string; color?: string }

export type BoardTemplate = {
  key: string               // stable key used by dashboards/goals to reference this board
  name: string
  board_type: BoardType
  icon: string              // lucide icon name
  color: string
  description: string
  groups: BoardGroupSpec[]
  fields: BoardFieldSpec[]
}

const C = {
  slate:  '#64748b',
  blue:   '#3b82f6',
  indigo: '#6366f1',
  violet: '#8b5cf6',
  green:  '#22c55e',
  amber:  '#f59e0b',
  rose:   '#f43f5e',
  cyan:   '#06b6d4',
  teal:   '#14b8a6',
}

// Reusable mortgage-relevant field sets ------------------------------------
const LEAD_FIELDS: BoardFieldSpec[] = [
  { name: 'Email', field_type: 'email' },
  { name: 'Phone', field_type: 'phone' },
  // Phase 5 — the 15 canonical planning categories (same list as the
  // Production Plan mix + record picker). Template-only: existing orgs'
  // already-provisioned Lead Source fields are never touched.
  { name: 'Lead Source', field_type: 'select', options: [...LEAD_SOURCE_LABELS] },
  { name: 'Loan Amount', field_type: 'currency' },
  { name: 'Loan Type', field_type: 'select', options: ['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'Non-QM'] },
  { name: 'Loan Purpose', field_type: 'select', options: ['Purchase', 'Refinance', 'Cash-Out Refi', 'HELOC'] },
  { name: 'Credit Score Range', field_type: 'select', options: ['760+', '720-759', '680-719', '640-679', '600-639', 'Below 600', 'Unknown'] },
  { name: 'Target Close Date', field_type: 'date' },
  { name: 'Next Action', field_type: 'text' },
  { name: 'Referral Source', field_type: 'text' },
]

const PIPELINE_FIELDS: BoardFieldSpec[] = [
  { name: 'Email', field_type: 'email' },
  { name: 'Phone', field_type: 'phone' },
  { name: 'Loan Amount', field_type: 'currency' },
  { name: 'Loan Type', field_type: 'select', options: ['Conventional', 'FHA', 'VA', 'USDA', 'Jumbo', 'Non-QM'] },
  { name: 'Loan Purpose', field_type: 'select', options: ['Purchase', 'Refinance', 'Cash-Out Refi', 'HELOC'] },
  { name: 'Target Close Date', field_type: 'date' },
  { name: 'Preapproval Expiration', field_type: 'date' },
  { name: 'Stage Owner', field_type: 'user' },
  { name: 'Next Action', field_type: 'text' },
]

const PARTNER_FIELDS: BoardFieldSpec[] = [
  { name: 'Partner Name', field_type: 'text' },
  { name: 'Brokerage / Company', field_type: 'text' },
  { name: 'Phone', field_type: 'phone' },
  { name: 'Email', field_type: 'email' },
  { name: 'Referrals (YTD)', field_type: 'number' },
  { name: 'Next Action', field_type: 'text' },
]

const PAST_CLIENT_FIELDS: BoardFieldSpec[] = [
  { name: 'Email', field_type: 'email' },
  { name: 'Phone', field_type: 'phone' },
  { name: 'Loan Amount', field_type: 'currency' },
  { name: 'Closed Date', field_type: 'date' },
  { name: 'Current Rate', field_type: 'number' },
  { name: 'Refi Opportunity', field_type: 'boolean' },
  { name: 'Next Action', field_type: 'text' },
]

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    key: 'prospecting',
    name: 'Prospecting',
    board_type: 'crm',
    icon: 'PhoneCall',
    color: C.blue,
    description: 'Top-of-funnel outreach — new leads through nurture.',
    groups: [
      { name: 'New Leads',          color: C.blue },
      { name: 'Attempting Contact', color: C.cyan },
      { name: 'Connected',          color: C.teal },
      { name: 'Follow-Up',          color: C.amber },
      { name: 'Nurture',            color: C.slate },
    ],
    fields: [...LEAD_FIELDS, NOTES_FIELD],
  },
  {
    key: 'active_leads',
    name: 'Active Leads',
    board_type: 'crm',
    icon: 'UserPlus',
    color: C.indigo,
    description: 'Engaged borrowers working toward a contract.',
    groups: [
      { name: 'New Inquiry',     color: C.blue },
      { name: 'Credit Pull',     color: C.cyan },
      { name: 'Preapproved',     color: C.teal },
      { name: 'Shopping',        color: C.amber },
      { name: 'Under Contract',  color: C.green },
    ],
    fields: [...LEAD_FIELDS, NOTES_FIELD],
  },
  {
    key: 'pipeline',
    name: 'Loan Pipeline',
    board_type: 'pipeline',
    icon: 'GitBranch',
    color: C.violet,
    description: 'Active files from processing to funded.',
    groups: [
      { name: 'Processing',      color: C.blue },
      { name: 'Conditions',      color: C.amber },
      { name: 'Clear to Close',  color: C.teal },
      { name: 'Funded',          color: C.green },
    ],
    fields: [...PIPELINE_FIELDS, NOTES_FIELD],
  },
  {
    key: 'past_clients',
    name: 'Past Clients',
    board_type: 'crm',
    icon: 'Heart',
    color: C.rose,
    description: 'Your database — retention, repeat, and refi.',
    groups: [
      { name: 'Recent Closings',   color: C.green },
      { name: 'Long-Term Nurture', color: C.slate },
      { name: 'Refi Opportunities',color: C.amber },
    ],
    fields: [...PAST_CLIENT_FIELDS, NOTES_FIELD],
  },
  {
    key: 'partners',
    name: 'Realtors / Partners',
    board_type: 'crm',
    icon: 'Handshake',
    color: C.teal,
    description: 'Referral relationships and partner growth.',
    groups: [
      { name: 'Active Partners', color: C.green },
      { name: 'New Partners',    color: C.blue },
      { name: 'Top Producers',   color: C.violet },
      { name: 'Nurture',         color: C.slate },
    ],
    fields: [...PARTNER_FIELDS, NOTES_FIELD],
  },
]

export function boardTemplateByKey(key: string): BoardTemplate | undefined {
  return BOARD_TEMPLATES.find(b => b.key === key)
}
