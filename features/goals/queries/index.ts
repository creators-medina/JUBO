import { createClient } from '@/lib/supabase/server'
import type {
  FunnelRow, FunnelStageRow, ConversionAssumptionRow,
  ProductionGoalRow, GoalTargetRow,
} from '../types'

export async function getFunnels(organizationId: string): Promise<FunnelRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('funnels')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
  return (data ?? []) as FunnelRow[]
}

export async function getFunnel(funnelId: string): Promise<FunnelRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('funnels').select('*').eq('id', funnelId).single()
  return (data ?? null) as FunnelRow | null
}

export async function getFunnelStages(funnelId: string): Promise<FunnelStageRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('funnel_stages')
    .select('*')
    .eq('funnel_id', funnelId)
    .order('stage_order', { ascending: true })
  return (data ?? []) as FunnelStageRow[]
}

export async function getFunnelStagesByIds(stageIds: string[]): Promise<FunnelStageRow[]> {
  if (stageIds.length === 0) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('funnel_stages')
    .select('*')
    .in('id', stageIds)
    .order('stage_order', { ascending: true })
  return (data ?? []) as FunnelStageRow[]
}

export async function getConversionAssumptions(organizationId: string, funnelId?: string): Promise<ConversionAssumptionRow[]> {
  const supabase = await createClient()
  let query = supabase
    .from('conversion_assumptions')
    .select('*')
    .eq('organization_id', organizationId)
  // Filter by funnel via a sub-select on stages
  if (funnelId) {
    const stages = await getFunnelStages(funnelId)
    const ids = stages.map(s => s.id)
    if (ids.length === 0) return []
    query = query.in('funnel_stage_id', ids)
  }
  const { data } = await query
  return (data ?? []) as ConversionAssumptionRow[]
}

/**
 * Active production goals for an org. Phase 33B: when `producerUserId` is
 * provided, returns only that producer's goals (their business plan); when
 * omitted/null, returns all org goals (legacy org-wide behavior — unchanged).
 */
export async function getProductionGoals(
  organizationId: string,
  producerUserId?: string | null,
): Promise<ProductionGoalRow[]> {
  const supabase = await createClient()
  let q = supabase
    .from('production_goals')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
  if (producerUserId) q = q.eq('producer_user_id', producerUserId)
  const { data } = await q.order('end_date', { ascending: false })
  return (data ?? []) as ProductionGoalRow[]
}

export async function getProductionGoal(goalId: string): Promise<ProductionGoalRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('production_goals').select('*').eq('id', goalId).single()
  return (data ?? null) as ProductionGoalRow | null
}

export async function getGoalTargets(productionGoalId: string): Promise<GoalTargetRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('goal_targets')
    .select('*')
    .eq('production_goal_id', productionGoalId)
  return (data ?? []) as GoalTargetRow[]
}
