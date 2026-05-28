// ─────────────────────────────────────────────────────────────────────────
// Workspace template resolver — picks the mortgage workspace shape from the
// record's board_type / record_type / board slug. Falls back to 'generic' so
// non-mortgage boards keep the standard workspace. Pure data; engine stays generic.
// ─────────────────────────────────────────────────────────────────────────

import type { MortgageData, WorkspaceTemplate, WorkspaceTemplateKey } from '../types'

const TEMPLATES: Record<WorkspaceTemplateKey, WorkspaceTemplate> = {
  lead: {
    key: 'lead', label: 'Lead', accent: 'text-blue-400',
    sections: ['lead_overview', 'opportunity_signals', 'key_facts', 'pipeline_history'],
  },
  loan: {
    key: 'loan', label: 'Loan File', accent: 'text-violet-400',
    sections: ['loan_summary', 'milestone_tracker', 'opportunity_signals', 'key_facts'],
  },
  partner: {
    key: 'partner', label: 'Partner', accent: 'text-teal-400',
    sections: ['relationship_summary', 'opportunity_signals', 'key_facts'],
  },
  past_client: {
    key: 'past_client', label: 'Past Client', accent: 'text-rose-400',
    sections: ['past_client_overview', 'opportunity_signals', 'key_facts'],
  },
  generic: {
    key: 'generic', label: 'Record', accent: 'text-muted-foreground',
    sections: ['key_facts'],
  },
}

export function resolveWorkspaceTemplate(data: MortgageData): WorkspaceTemplate {
  return TEMPLATES[resolveTemplateKey(data)]
}

export function resolveTemplateKey(data: MortgageData): WorkspaceTemplateKey {
  const recordType = (data.record?.record_type ?? '') as string
  const boardType = (data.board?.board_type ?? '') as string
  const slug = (data.board?.slug ?? '') as string

  // Most specific signals first.
  if (recordType === 'loan' || boardType === 'pipeline' || slug === 'loan-pipeline') return 'loan'
  if (recordType === 'referral' || slug === 'realtors-partners' || slug.includes('partner')) return 'partner'
  if (slug === 'past-clients' || (recordType === 'contact' && slug.includes('past'))) return 'past_client'
  if (recordType === 'lead' || slug === 'active-leads' || slug === 'prospecting' || boardType === 'crm') return 'lead'
  return 'generic'
}
