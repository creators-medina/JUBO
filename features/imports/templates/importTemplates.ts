// ─────────────────────────────────────────────────────────────────────────
// Starter import templates — suggest a target board + dedupe rules so the LO
// doesn't start from scratch. Pure data. Board references are by slug (the
// Phase 15 starter boards); if the board isn't present the wizard just falls
// back to manual board selection.
// ─────────────────────────────────────────────────────────────────────────

import type { DedupeKey } from '../types'
import type { RecordType as DbRecordType } from '@/types/database'

export type ImportTemplate = {
  key: string
  label: string
  description: string
  icon: string
  /** slug of the Phase 15 starter board this typically targets */
  targetBoardSlug: string | null
  dedupeKeys: DedupeKey[]
  recordType?: DbRecordType
}

export const IMPORT_TEMPLATES: ImportTemplate[] = [
  { key: 'past_clients',    label: 'Past Clients',      description: 'Your closed-loan database for retention & refi.', icon: 'Heart',     targetBoardSlug: 'past-clients',      dedupeKeys: ['email', 'phone'], recordType: 'contact' },
  { key: 'call_lists',      label: 'Call List',          description: 'Prospects to work through outreach.',            icon: 'PhoneCall', targetBoardSlug: 'prospecting',       dedupeKeys: ['phone', 'email'], recordType: 'lead' },
  { key: 'active_leads',    label: 'Active Leads',       description: 'Borrowers already in progress.',                 icon: 'UserPlus',  targetBoardSlug: 'active-leads',      dedupeKeys: ['email', 'phone'], recordType: 'lead' },
  { key: 'realtor_partners',label: 'Realtor Partners',   description: 'Referral relationships & partners.',             icon: 'Handshake', targetBoardSlug: 'realtors-partners', dedupeKeys: ['email', 'name'],  recordType: 'referral' },
  { key: 'loan_pipeline',   label: 'Loan Pipeline',      description: 'Active files in process.',                       icon: 'GitBranch', targetBoardSlug: 'loan-pipeline',     dedupeKeys: ['email', 'name'],  recordType: 'loan' },
  { key: 'monday_export',   label: 'Monday.com Export',  description: 'Bring a Monday board export into Jubo.',         icon: 'FileSpreadsheet', targetBoardSlug: null,          dedupeKeys: ['name'],           recordType: 'custom' },
]

export function importTemplateByKey(key: string): ImportTemplate | undefined {
  return IMPORT_TEMPLATES.find((t) => t.key === key)
}
