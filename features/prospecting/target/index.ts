// ─────────────────────────────────────────────────────────────────────────
// Phase 23 — Goal-linked daily call target.
//
// One place that answers "how many calls should this LO make today?" so the
// number isn't hardcoded to 25 across the cockpit, Today, and widgets. Sources
// are tried in priority order; the chosen one is labelled for trust.
//   1. Active session target   2. Onboarding focus answers
//   3. Goal engine (calls/outreach stage)   4. Safe fallback default
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { resolveProducerUserId } from '@/features/auth/guards'
import { DEFAULT_DAILY_CALL_GOAL } from '../types'
import type { SessionRow, PeriodCallTargets, ProductionContext } from '../types'

export type CallTargetSource = 'session' | 'profile' | 'goal' | 'default'

export type DailyCallTarget = {
  target: number
  source: CallTargetSource
  label: string
}

// Plain-language source labels (operator audit): shown in the goal editor's
// tooltip and on the Production Plan — they must answer "where did this
// number come from?" without jargon.
const SOURCE_LABEL: Record<CallTargetSource, string> = {
  session: 'From your active call session',
  profile: 'From your profile',
  goal: 'From your production goal',
  default: 'App default',
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = obj[k]
    const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
    if (Number.isFinite(n) && n > 0) return Math.round(n)
  }
  return null
}

const CALL_STAGE_RE = /call|dial|contact|outreach|conversation|connect/i

export async function getDailyCallTarget(
  organizationId: string,
  userId: string,
  session?: SessionRow | null,
): Promise<DailyCallTarget> {
  // 1. An active session's explicit target always wins.
  if (session && session.target_calls > 0) {
    return { target: session.target_calls, source: 'session', label: SOURCE_LABEL.session }
  }

  const supabase = await createClient()

  // 2. Onboarding focus answers (best-effort — keys vary, column may be absent).
  try {
    const { data: profile } = await supabase
      .from('onboarding_profiles')
      .select('answers, focus_weights')
      .eq('organization_id', organizationId)
      .limit(1)
      .maybeSingle()
    const answers = { ...(profile?.answers as Record<string, unknown> ?? {}), ...(profile?.focus_weights as Record<string, unknown> ?? {}) }
    const fromProfile = pickNumber(answers, ['daily_calls', 'dailyCalls', 'daily_call_goal', 'dailyCallGoal', 'calls_per_day', 'callsPerDay'])
    if (fromProfile) return { target: fromProfile, source: 'profile', label: SOURCE_LABEL.profile }
  } catch { /* no profile / column — skip */ }

  // 3. Goal engine: a production goal whose funnel has a calls/outreach stage
  //    with a cached daily target.
  try {
    // Phase 33B — derive from the producer's own goal (legacy org-wide for support/unknown).
    const producerId = await resolveProducerUserId(organizationId, userId, supabase)
    const fromGoal = await deriveCallTargetFromGoals(supabase, organizationId, producerId)
    if (fromGoal) return { target: fromGoal, source: 'goal', label: SOURCE_LABEL.goal }
  } catch { /* not derivable — skip */ }

  // 4. Safe fallback.
  return { target: DEFAULT_DAILY_CALL_GOAL, source: 'default', label: SOURCE_LABEL.default }
}

// Working-cadence multipliers used when a goal doesn't specify period targets.
// ~5 working days/week, ~21/month, ~250/year (≈50 weeks). Display-only.
const WORK_DAYS_PER_WEEK = 5
const WORK_DAYS_PER_MONTH = 21
const WORK_DAYS_PER_YEAR = 250

/**
 * Phase 34B — daily/weekly/monthly/yearly call targets for the momentum section.
 * Daily resolves through the existing priority chain (session > profile > goal >
 * default). Period targets prefer the goal's stored weekly/monthly/yearly_target
 * and otherwise scale off the daily number. UX-only; no schema changes.
 */
export async function getCallTargets(
  organizationId: string,
  userId: string,
  session?: SessionRow | null,
): Promise<PeriodCallTargets> {
  const daily = await getDailyCallTarget(organizationId, userId, session)

  let periods: { weekly: number | null; monthly: number | null; yearly: number | null } | null = null
  let production: ProductionContext | null = null
  try {
    const supabase = await createClient()
    const producerId = await resolveProducerUserId(organizationId, userId, supabase)
    periods = await derivePeriodTargetsFromGoals(supabase, organizationId, producerId)
    production = await fetchProductionContext(supabase, organizationId, producerId)
  } catch { /* not derivable — fall back to daily multiples */ }

  return {
    daily: daily.target,
    weekly: periods?.weekly ?? daily.target * WORK_DAYS_PER_WEEK,
    monthly: periods?.monthly ?? daily.target * WORK_DAYS_PER_MONTH,
    yearly: periods?.yearly ?? daily.target * WORK_DAYS_PER_YEAR,
    source: daily.source,
    label: daily.label,
    production,
  }
}

type SB = Awaited<ReturnType<typeof createClient>>

async function deriveCallTargetFromGoals(supabase: SB, organizationId: string, producerUserId?: string | null): Promise<number | null> {
  let gq = supabase
    .from('production_goals')
    .select('id, funnel_id')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .not('funnel_id', 'is', null)
  if (producerUserId) gq = gq.eq('producer_user_id', producerUserId)
  const { data: goals } = await gq.limit(5)
  if (!goals || goals.length === 0) return null

  for (const goal of goals as Array<{ id: string; funnel_id: string | null }>) {
    if (!goal.funnel_id) continue
    const { data: stages } = await supabase
      .from('funnel_stages')
      .select('id, name, slug')
      .eq('funnel_id', goal.funnel_id)
    const callStage = (stages as Array<{ id: string; name: string; slug: string }> | null ?? [])
      .find((s) => CALL_STAGE_RE.test(s.slug) || CALL_STAGE_RE.test(s.name))
    if (!callStage) continue

    const { data: target } = await supabase
      .from('goal_targets')
      .select('daily_target')
      .eq('production_goal_id', goal.id)
      .eq('funnel_stage_id', callStage.id)
      .limit(1)
      .maybeSingle()
    const daily = target?.daily_target != null ? Math.round(Number(target.daily_target)) : null
    if (daily && daily > 0) return daily
  }
  return null
}

/** The producer's active production goal, for the "why this matters" pace card. */
async function fetchProductionContext(
  supabase: SB,
  organizationId: string,
  producerUserId?: string | null,
): Promise<ProductionContext | null> {
  let q = supabase
    .from('production_goals')
    .select('name, timeframe, target_revenue')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
  if (producerUserId) q = q.eq('producer_user_id', producerUserId)
  const { data } = await q.order('end_date', { ascending: false }).limit(1).maybeSingle()
  if (!data) return null
  const row = data as { name: string | null; timeframe: string | null; target_revenue: number | null }
  const incomeTarget = row.target_revenue != null && Number(row.target_revenue) > 0 ? Math.round(Number(row.target_revenue)) : null
  return {
    name: row.name ?? 'production plan',
    incomeTarget,
    timeframe: row.timeframe ?? 'yearly',
  }
}

/** Like deriveCallTargetFromGoals, but returns the stored period targets. */
async function derivePeriodTargetsFromGoals(
  supabase: SB,
  organizationId: string,
  producerUserId?: string | null,
): Promise<{ weekly: number | null; monthly: number | null; yearly: number | null } | null> {
  let gq = supabase
    .from('production_goals')
    .select('id, funnel_id')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .not('funnel_id', 'is', null)
  if (producerUserId) gq = gq.eq('producer_user_id', producerUserId)
  const { data: goals } = await gq.limit(5)
  if (!goals || goals.length === 0) return null

  const round = (v: unknown): number | null => {
    const n = v != null ? Math.round(Number(v)) : NaN
    return Number.isFinite(n) && n > 0 ? n : null
  }

  for (const goal of goals as Array<{ id: string; funnel_id: string | null }>) {
    if (!goal.funnel_id) continue
    const { data: stages } = await supabase
      .from('funnel_stages')
      .select('id, name, slug')
      .eq('funnel_id', goal.funnel_id)
    const callStage = (stages as Array<{ id: string; name: string; slug: string }> | null ?? [])
      .find((s) => CALL_STAGE_RE.test(s.slug) || CALL_STAGE_RE.test(s.name))
    if (!callStage) continue

    const { data: target } = await supabase
      .from('goal_targets')
      .select('weekly_target, monthly_target, yearly_target')
      .eq('production_goal_id', goal.id)
      .eq('funnel_stage_id', callStage.id)
      .limit(1)
      .maybeSingle()
    if (!target) continue
    const weekly = round(target.weekly_target)
    const monthly = round(target.monthly_target)
    const yearly = round(target.yearly_target)
    if (weekly || monthly || yearly) return { weekly, monthly, yearly }
  }
  return null
}
