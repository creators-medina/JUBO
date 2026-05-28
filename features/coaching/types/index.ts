// ─────────────────────────────────────────────────────────────────────────
// Phase 24 — Revenue Intelligence + Coaching Engine types.
// All mortgage/business math lives under features/coaching/ — generic engines
// stay generic. "Talk-tos" (real conversations) are the activity unit, not dials.
// ─────────────────────────────────────────────────────────────────────────

// ── Baselines (overridable; mirrors coaching_assumptions columns) ──────────

export type Baselines = {
  leadsPerPartner: number              // yearly leads per committed partner
  conversationsPerPartner: number      // yearly conversations to acquire/maintain a partner
  referralConversionRate: number       // referral lead -> funded (0..1)
  workingWeeksPerYear: number
  workingDaysPerWeek: number
  avgCommission: number                // $ per funded loan
  avgLoanSize: number | null
  leadToFundedRate: number             // overall lead -> funded (0..1)
  leadToConnectedRate: number          // lead -> real conversation (0..1)
  connectedToAppRate: number
  appToPreapprovedRate: number
  preapprovedToClosedRate: number
  weeklyTalkToFloorPercent: number     // floor for "on pace" / streak credit
  staleBoundaryDays: number
  partnerAtRiskDays: number
}

/** Raw DB row from coaching_assumptions (snake_case, nullable overrides). */
export type CoachingAssumptionsRow = {
  id: string
  organization_id: string
  user_id: string | null
  leads_per_partner: number
  conversations_per_partner: number
  referral_conversion_rate: number
  working_weeks_per_year: number
  working_days_per_week: number
  avg_commission: number | null
  avg_loan_size: number | null
  lead_to_funded_rate: number
  lead_to_connected_rate: number
  connected_to_app_rate: number
  app_to_preapproved_rate: number
  preapproved_to_closed_rate: number
  weekly_talk_to_floor_percent: number
  stale_boundary_days: number
  partner_at_risk_days: number
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Reverse-engineered plan (income -> daily talk-tos) ─────────────────────

export type ReverseEngineeredPlan = {
  incomeGoal: number
  closingTarget: number
  fundedTarget: number
  preapprovedTarget: number
  appTarget: number
  connectedTarget: number          // total conversations that must convert
  leadsTarget: number
  partnersNeeded: number
  yearlyConversations: number      // talk-tos required across the year
  weeklyConversations: number      // weekly talk-to floor
  dailyConversations: number       // daily talk-to target
  weeklyLeads: number
  weeklyPartnerAdds: number
  baselines: Baselines
  notes: string[]
}

// ── Partner intelligence ───────────────────────────────────────────────────

export type PartnerStatus = 'active' | 'cooling_off' | 'at_risk' | 'dormant'

export type PartnerHealth = {
  recordId: string
  name: string
  boardId: string | null
  status: PartnerStatus
  daysSinceContact: number | null
  leadsYtd: number
  conversationsYtd: number
  fundedYtd: number
  score: number                    // 0..100
}

export type PartnerMetrics = {
  totalPartners: number
  activePartners: number
  coolingOffPartners: number
  atRiskPartners: number
  dormantPartners: number
  leadsThisYear: number
  leadsPerPartnerAvg: number
  partnersNeeded: number           // from the reverse-engineered plan
  partnerGap: number               // partnersNeeded - activePartners
  conversationsThisWeek: number    // talk-tos with partners
  weeklyConversationTarget: number
  conversationPacePercent: number  // 0..100
  topPartners: PartnerHealth[]
}

// ── Forecasting ─────────────────────────────────────────────────────────────

export type Forecast = {
  metric: 'closings' | 'income' | 'talk_tos'
  label: string
  current: number                  // measured so far
  target: number
  projected: number                // dynamic projection to period end
  variancePercent: number          // (projected - target) / target * 100
  onTrack: boolean
  consistency: number              // 0..1 (1 = perfectly consistent activity)
}

// ── Execution score ─────────────────────────────────────────────────────────

export type ExecutionFactor = {
  key: string
  label: string
  value: number                    // 0..100 contribution
  weight: number                   // 0..1
}

export type ExecutionInterpretation = 'excellent' | 'good' | 'fair' | 'needs_work'

export type ExecutionScore = {
  overall: number                  // 0..100
  interpretation: ExecutionInterpretation
  factors: ExecutionFactor[]
}

// ── Self-correcting assumptions ─────────────────────────────────────────────

export type ConversionVariance = {
  key: string
  label: string
  assumed: number                  // 0..1
  measured: number                 // 0..1
  sampleSize: number
  variancePercent: number          // (measured - assumed)/assumed * 100
  direction: 'better' | 'worse'
  confidence: 'low' | 'medium' | 'high'
  recommendation: string | null
}

// ── Coaching insights (heuristic) ───────────────────────────────────────────

export type CoachTone = 'good' | 'warn' | 'urgent' | 'info'

export type CoachInsight = {
  type: string
  title: string
  body: string
  tone: CoachTone
  icon: string
  suggestion?: string
}

// ── Coaching snapshot (assembled server-side, fed to widgets/Today) ─────────

export type CoachingSnapshot = {
  baselines: Baselines
  plan: ReverseEngineeredPlan | null   // null if no income goal yet
  talkTosToday: number
  talkTosThisWeek: number
  closingsYtd: number
  daysElapsed: number
  daysInPeriod: number
  partner: PartnerMetrics
  execution: ExecutionScore
  forecasts: Forecast[]
  variances: ConversionVariance[]
}

// ── Widget configs + data (8 coaching widgets) ──────────────────────────────

export type ExecutionScoreWidgetConfig = Record<string, never>
export type TalkToPaceWidgetConfig = { cadence?: 'daily' | 'weekly' }
export type PartnerGrowthWidgetConfig = { top_n?: number }
export type ProjectedClosingsWidgetConfig = Record<string, never>
export type ProjectedIncomeWidgetConfig = Record<string, never>
export type PartnerHealthWidgetConfig = Record<string, never>
export type PaceForecastWidgetConfig = Record<string, never>
export type WeeklyScorecardWidgetConfig = Record<string, never>

export type ExecutionScoreData = {
  overall: number
  interpretation: ExecutionInterpretation
  factors: ExecutionFactor[]
}

export type TalkToPaceData = {
  cadence: 'daily' | 'weekly'
  target: number
  actual: number
  remaining: number
  pacePercent: number
  status: 'ahead' | 'on_pace' | 'behind'
  source: string
}

export type PartnerGrowthData = {
  activePartners: number
  partnersNeeded: number
  partnerGap: number
  leaders: { recordId: string; name: string; leadsYtd: number; status: PartnerStatus }[]
}

export type ProjectionData = {
  metric: string
  label: string
  current: number
  target: number
  projected: number
  variancePercent: number
  onTrack: boolean
  isCurrency: boolean
}

export type PartnerHealthData = {
  total: number
  active: number
  coolingOff: number
  atRisk: number
  dormant: number
  topAtRisk: { recordId: string; name: string; daysSinceContact: number | null }[]
}

export type PaceForecastData = {
  rows: { metric: string; label: string; target: number; projected: number; variancePercent: number; onTrack: boolean; isCurrency: boolean }[]
}

export type WeeklyScorecardData = {
  weeklyScore: number
  talkTos: number
  talkToTarget: number
  partnersTouched: number
  leads: number
  days: { label: string; score: number; status: 'ahead' | 'on_pace' | 'behind' | 'none' }[]
}

export function defaultExecutionScoreConfig(): ExecutionScoreWidgetConfig { return {} }
export function defaultTalkToPaceConfig(): TalkToPaceWidgetConfig { return { cadence: 'daily' } }
export function defaultPartnerGrowthConfig(): PartnerGrowthWidgetConfig { return { top_n: 5 } }
export function defaultProjectedClosingsConfig(): ProjectedClosingsWidgetConfig { return {} }
export function defaultProjectedIncomeConfig(): ProjectedIncomeWidgetConfig { return {} }
export function defaultPartnerHealthConfig(): PartnerHealthWidgetConfig { return {} }
export function defaultPaceForecastConfig(): PaceForecastWidgetConfig { return {} }
export function defaultWeeklyScorecardConfig(): WeeklyScorecardWidgetConfig { return {} }
