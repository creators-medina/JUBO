// ─────────────────────────────────────────────────────────────────────────
// Phase 20 — Mortgage operational layer types.
//
// This layer sits ON TOP of the generic record/board/workspace engines. It
// reads the same loaded workspace data and renders mortgage-specific sections;
// it never changes the underlying engine or schema.
// ─────────────────────────────────────────────────────────────────────────

export type WorkspaceTemplateKey = 'lead' | 'loan' | 'partner' | 'past_client' | 'generic'

/** The slice of loaded workspace data the mortgage layer reads (structurally
 *  compatible with WorkspacePanel's `Loaded`). All loose — it's view-side. */
export type MortgageData = {
  record: AnyRow
  board: AnyRow | null
  fields: AnyRow[]
  fieldValues: AnyRow[]
  activities: AnyRow[]
  tasks: AnyRow[]
  movements: AnyRow[]
  notes: AnyRow[]
  groups: AnyRow[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = Record<string, any>

export type OpportunitySignalLevel = 'positive' | 'info' | 'warning' | 'urgent'

export type OpportunitySignal = {
  key: string
  level: OpportunitySignalLevel
  label: string
  detail?: string
  icon: string // lucide icon name
}

export type WorkspaceTemplate = {
  key: WorkspaceTemplateKey
  label: string
  accent: string // tailwind text color token for the template accent
  /** ordered section keys this template renders */
  sections: SectionKey[]
}

export type SectionKey =
  | 'lead_overview'
  | 'loan_summary'
  | 'milestone_tracker'
  | 'relationship_summary'
  | 'past_client_overview'
  | 'opportunity_signals'
  | 'key_facts'
  | 'pipeline_history'
