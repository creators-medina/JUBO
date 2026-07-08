// ─────────────────────────────────────────────────────────────────────────
// Phase 15 — Onboarding / workspace-provisioning types.
//
// Everything here is intentionally GENERIC. Answers are stored as a loose,
// serializable shape; the mortgage flavor lives only in the template data
// (templates/*) and the question copy (questions/*), never in the platform.
// ─────────────────────────────────────────────────────────────────────────

export type OnboardingStatus = 'in_progress' | 'completed'

/** Stable keys for the wizard steps (also used for the progress rail + resume). */
export type OnboardingStepKey =
  | 'welcome'
  | 'production'
  | 'goals'
  | 'plan'
  | 'workflow'
  | 'focus'
  | 'imports'
  | 'integrations'
  | 'generating'
  | 'done'

/** Weighted focus areas — drive personalization (which engine to emphasize). */
export type FocusArea =
  | 'prospecting'
  | 'conversion'
  | 'follow_up'
  | 'partner_growth'
  | 'pipeline'
  | 'recruiting'
  | 'retention'

export type FocusWeights = Partial<Record<FocusArea, number>>

/** The full set of answers gathered across steps. All optional — the LO can
 *  skip, and the generators fall back to safe defaults. */
export type OnboardingAnswers = {
  // Production history
  loans_closed_last_year?: number
  production_volume_last_year?: number
  average_loan_size?: number
  average_monthly_closings?: number
  team_size?: number

  // Goals
  target_closings?: number
  target_volume?: number
  target_income?: number
  target_monthly_closings?: number
  biggest_bottleneck?: string

  // Workflow / business model (multi-select booleans)
  self_source?: boolean
  realtor_leads?: boolean
  past_clients?: boolean
  buys_leads?: boolean
  recruiting?: boolean
  team_or_solo?: 'team' | 'solo'

  // Daily Call Log (Phase 1) — editable daily outbound-call goal; read by the
  // call-target resolver (features/prospecting/target) as 'daily_call_goal'.
  daily_call_goal?: number

  // Production Plan (Phase 3) — Business Plan Math assumptions, all editable
  // by the LO (features/production-plan/calc). These keys are the CANONICAL
  // planning-assumption source; `production_goals` continues to power the
  // legacy Business Plan / Goals pages until a later consolidation phase.
  production_plan_annual_net_income_goal?: number
  production_plan_average_loan_amount?: number
  production_plan_gross_comp_bps?: number
  production_plan_lo_split_percent?: number
  production_plan_net_comp_bps_override?: number | null
  production_plan_lead_source_mix?: Record<string, number>
  production_plan_conversion_rates?: Record<string, number>

  // Business-plan intake (Phase 4) — capacity/database context collected in
  // the onboarding "Plan" step. Planning inputs only; no record-level fields.
  realtor_partner_count?: number
  past_client_count?: number
  online_leads_per_month?: number
  target_markets?: string
  support_capacity?: 'just_me' | 'shared_assistant' | 'dedicated_assistant' | 'full_team'
}

/** Derived tailoring summary, persisted so the rest of the app can read it. */
export type Personalization = {
  primary_focus?: FocusArea
  default_dashboard_key?: string
  board_order?: string[]
  emphasized_workflows?: string[]
  today_priority?: 'prospecting' | 'pipeline' | 'follow_up' | 'balanced'
}

// ── Row types (DB shape) ─────────────────────────────────────────────────────

export type OnboardingProfileRow = {
  id: string
  organization_id: string
  status: OnboardingStatus
  current_step: OnboardingStepKey | null
  answers: OnboardingAnswers
  focus_weights: FocusWeights
  personalization: Personalization
  provisioned: boolean
  provisioned_at: string | null
  completed_at: string | null
  plan_revealed_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type SetupChecklistItemRow = {
  id: string
  organization_id: string
  item_key: string
  title: string
  description: string | null
  icon: string | null
  action_href: string | null
  position: number
  completed: boolean
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type IntegrationProvider = 'arive' | 'ghl' | 'zapier' | 'los' | 'other'
export type IntegrationStatus = 'not_started' | 'interested' | 'connect_later' | 'connected'

export type IntegrationPreferenceRow = {
  id: string
  organization_id: string
  provider: IntegrationProvider
  status: IntegrationStatus
  config: Record<string, unknown>
  note: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type OnboardingUploadKind =
  | 'past_clients'
  | 'call_list'
  | 'realtors'
  | 'active_leads'
  | 'loans'

export type OnboardingUploadRow = {
  id: string
  organization_id: string
  kind: OnboardingUploadKind
  file_name: string
  mime_type: string | null
  size_bytes: number | null
  row_count: number | null
  status: string
  created_by: string | null
  created_at: string
}

// ── Question schema (data-driven wizard) ────────────────────────────────────

export type QuestionType = 'number' | 'currency' | 'text' | 'select' | 'boolean' | 'weighted' | 'source_mix'

export type QuestionOption = { value: string; label: string }

export type Question = {
  key: keyof OnboardingAnswers | string
  label: string
  helper?: string
  type: QuestionType
  placeholder?: string
  options?: QuestionOption[]
  /** for `weighted` — the focus areas to rank */
  focusAreas?: { area: FocusArea; label: string; helper?: string }[]
  optional?: boolean
}

export type StepDefinition = {
  key: OnboardingStepKey
  title: string
  subtitle: string
  /** progress-rail label */
  railLabel: string
  questions?: Question[]
}
