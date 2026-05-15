'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { calculateRequiredStageTargets } from '../calculations/engine'
import { getFunnelStages, getConversionAssumptions } from '../queries'
import type { GoalTimeframe } from '../types'

// ── Funnels ─────────────────────────────────────────────────────────────────

export async function createFunnel(input: {
  organization_id: string
  name: string
  description?: string
}): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_funnel', {
    p_organization_id: input.organization_id,
    p_name:            input.name,
    p_description:     input.description ?? null,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Failed to create funnel')
  revalidatePath('/goals')
  return data as string
}

export async function updateFunnel(funnelId: string, updates: { name?: string; description?: string }) {
  const supabase = await createClient()
  const { error } = await supabase.from('funnels').update(updates).eq('id', funnelId)
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
}

export async function archiveFunnel(funnelId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('funnels').update({ is_archived: true }).eq('id', funnelId)
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
}

// ── Funnel Stages ────────────────────────────────────────────────────────────

export async function createFunnelStage(input: {
  funnel_id: string
  name: string
  slug: string
  stage_order: number
  stage_type?: string
  board_group_id?: string | null
}): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_funnel_stage', {
    p_funnel_id:      input.funnel_id,
    p_name:           input.name,
    p_slug:           input.slug,
    p_stage_order:    input.stage_order,
    p_stage_type:     input.stage_type ?? 'activity',
    p_board_group_id: input.board_group_id ?? null,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Failed to create stage')
  revalidatePath('/goals')
  return data as string
}

export async function updateFunnelStage(stageId: string, updates: {
  name?: string
  stage_order?: number
  stage_type?: string
  board_group_id?: string | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('funnel_stages').update(updates).eq('id', stageId)
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
}

export async function deleteFunnelStage(stageId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('funnel_stages').delete().eq('id', stageId)
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
}

// ── Conversion Assumptions ───────────────────────────────────────────────────

export async function upsertConversionAssumption(input: {
  organization_id: string
  funnel_stage_id: string
  target_stage_id: string
  conversion_rate: number          // 0..1
  timeframe?: string
  notes?: string
}): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('upsert_conversion_assumption', {
    p_organization_id: input.organization_id,
    p_funnel_stage_id: input.funnel_stage_id,
    p_target_stage_id: input.target_stage_id,
    p_conversion_rate: input.conversion_rate,
    p_timeframe:       input.timeframe ?? 'monthly',
    p_notes:           input.notes ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
  return data as string
}

export async function deleteConversionAssumption(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('conversion_assumptions').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
}

// ── Production Goals ─────────────────────────────────────────────────────────

export async function createProductionGoal(input: {
  organization_id: string
  funnel_id: string | null
  name: string
  timeframe: GoalTimeframe | string
  start_date: string
  end_date: string
  target_units?: number | null
  target_volume?: number | null
  target_revenue?: number | null
}): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('create_production_goal', {
    p_organization_id: input.organization_id,
    p_funnel_id:       input.funnel_id,
    p_name:            input.name,
    p_timeframe:       input.timeframe,
    p_start_date:      input.start_date,
    p_end_date:        input.end_date,
    p_target_units:    input.target_units ?? null,
    p_target_volume:   input.target_volume ?? null,
    p_target_revenue:  input.target_revenue ?? null,
  })
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Failed to create production goal')

  // Generate pacing targets immediately if we have enough info
  if (input.funnel_id && input.target_units) {
    try { await regenerateGoalTargets(data as string) } catch { /* non-fatal */ }
  }

  revalidatePath('/goals')
  return data as string
}

export async function updateProductionGoal(goalId: string, updates: {
  name?: string
  funnel_id?: string | null
  timeframe?: string
  start_date?: string
  end_date?: string
  target_units?: number | null
  target_volume?: number | null
  target_revenue?: number | null
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('production_goals').update(updates).eq('id', goalId)
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
}

export async function archiveProductionGoal(goalId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('production_goals').update({ is_archived: true }).eq('id', goalId)
  if (error) throw new Error(error.message)
  revalidatePath('/goals')
}

/**
 * Recompute per-stage targets for a production goal using the funnel's
 * conversion assumptions and write them to goal_targets (batch upsert via RPC).
 */
export async function regenerateGoalTargets(goalId: string): Promise<void> {
  const supabase = await createClient()

  const { data: goal, error: goalErr } = await supabase
    .from('production_goals')
    .select('*')
    .eq('id', goalId)
    .single()
  if (goalErr || !goal) throw new Error(goalErr?.message ?? 'Goal not found')
  if (!goal.funnel_id) throw new Error('Goal has no funnel — cannot generate targets')

  const stages = await getFunnelStages(goal.funnel_id)
  const assumptions = await getConversionAssumptions(goal.organization_id, goal.funnel_id)

  const targets = calculateRequiredStageTargets(
    {
      start_date: goal.start_date,
      end_date: goal.end_date,
      target_units: goal.target_units,
    },
    stages,
    assumptions,
  )

  const payload = targets.map(t => ({
    funnel_stage_id: t.funnel_stage_id,
    daily_target:    String(t.daily_target),
    weekly_target:   String(t.weekly_target),
    monthly_target:  String(t.monthly_target),
    yearly_target:   String(t.yearly_target),
  }))

  const { error } = await supabase.rpc('set_goal_targets', {
    p_production_goal_id: goalId,
    p_targets: payload,
  })
  if (error) throw new Error(error.message)

  revalidatePath('/goals')
}
