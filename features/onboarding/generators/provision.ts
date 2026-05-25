// ─────────────────────────────────────────────────────────────────────────
// Workspace provisioning orchestrator.
//
// Turns onboarding answers + starter templates into a real, personalized
// workspace by driving the EXISTING engines:
//   • boards / board_groups / fields   (board engine)
//   • create_funnel / stages / assumptions / production goal (goal engine)
//   • createDashboard / addWidget       (dashboard + widget engine)
//   • ensureDefaultWorkflows / setWorkflowEnabled (workflow engine)
//
// No board/dashboard/goal logic is reimplemented here — only orchestration and
// template→id wiring. Idempotency is guarded by onboarding_profiles.provisioned.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import {
  BOARD_TEMPLATES,
  DASHBOARD_TEMPLATES,
  STARTER_FUNNEL,
  resolveGoalTargets,
  SETUP_CHECKLIST,
  computeEnabledWorkflows,
} from '../templates'
import { computePersonalization } from './personalization'
import { mapStarterFunnelStagesToGroups } from './funnelMapping'
import {
  createFunnel,
  createFunnelStage,
  upsertConversionAssumption,
  createProductionGoal,
} from '@/features/goals/actions'
import { createDashboard, addWidget } from '@/features/dashboards/actions'
import { ensureDefaultWorkflows, setWorkflowEnabled } from '@/features/workflows/actions'
import type { OnboardingAnswers, FocusWeights } from '../types'

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}
function fieldSlug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '')
}

export type ProvisionResult = {
  boards: number
  groups: number
  fields: number
  dashboards: number
  widgets: number
  goalCreated: boolean
  workflowsEnabled: number
  checklistItems: number
}

/**
 * Provision the full starter workspace for an org. Safe to import from a
 * 'use server' action. Returns counts for reporting. Throws on hard failures
 * (board/goal creation); soft steps (daily-action generation) are best-effort.
 */
export async function provisionWorkspace(
  organizationId: string,
  answers: OnboardingAnswers,
  weights: FocusWeights,
): Promise<ProvisionResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const personalization = computePersonalization(answers, weights)
  const result: ProvisionResult = {
    boards: 0, groups: 0, fields: 0, dashboards: 0, widgets: 0,
    goalCreated: false, workflowsEnabled: 0, checklistItems: 0,
  }

  // ── 1. Boards + groups + fields ──────────────────────────────────────────
  // boardKey → { id, groupIds: { groupName → id } }
  const boardMap = new Map<string, { id: string }>()
  const orderedBoards = orderBoards(personalization.board_order)

  for (const tpl of orderedBoards) {
    const { data: board, error } = await supabase
      .from('boards')
      .insert({
        organization_id: organizationId,
        name: tpl.name,
        slug: slug(tpl.name),
        description: tpl.description,
        board_type: tpl.board_type,
        color: tpl.color,
        icon: tpl.icon,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (error || !board) throw new Error(`Board "${tpl.name}": ${error?.message ?? 'no id'}`)
    boardMap.set(tpl.key, { id: board.id })
    result.boards++

    // Groups
    const groupRows = tpl.groups.map((g, i) => ({
      board_id: board.id, name: g.name, color: g.color ?? null, position: i,
    }))
    if (groupRows.length) {
      const { error: gErr } = await supabase.from('board_groups').insert(groupRows)
      if (gErr) throw new Error(`Groups for "${tpl.name}": ${gErr.message}`)
      result.groups += groupRows.length
    }

    // Fields
    const fieldRows = tpl.fields.map((f, i) => ({
      organization_id: organizationId,
      board_id: board.id,
      name: f.name,
      slug: fieldSlug(f.name),
      field_type: f.field_type,
      is_required: f.is_required ?? false,
      position: i,
      config: f.options ? { options: f.options } : {},
    }))
    if (fieldRows.length) {
      const { error: fErr } = await supabase.from('fields').insert(fieldRows)
      if (fErr) throw new Error(`Fields for "${tpl.name}": ${fErr.message}`)
      result.fields += fieldRows.length
    }
  }

  // ── 2. Goal: funnel + stages + assumptions + production goal ──────────────
  let productionGoalId: string | null = null
  try {
    const funnelId = await createFunnel({
      organization_id: organizationId,
      name: STARTER_FUNNEL.funnelName,
      description: STARTER_FUNNEL.funnelDescription,
    })

    const stageIds = new Map<string, string>()
    for (let i = 0; i < STARTER_FUNNEL.stages.length; i++) {
      const st = STARTER_FUNNEL.stages[i]
      const id = await createFunnelStage({
        funnel_id: funnelId,
        name: st.name,
        slug: st.slug,
        stage_order: i,
        stage_type: st.stage_type,
      })
      stageIds.set(st.key, id)
    }

    for (const a of STARTER_FUNNEL.assumptions) {
      const from = stageIds.get(a.fromKey)
      const to = stageIds.get(a.toKey)
      if (!from || !to) continue
      await upsertConversionAssumption({
        organization_id: organizationId,
        funnel_stage_id: from,
        target_stage_id: to,
        conversion_rate: a.rate,
        timeframe: 'monthly',
        notes: a.note,
      })
    }

    const targets = resolveGoalTargets(answers)
    const year = new Date().getFullYear()
    productionGoalId = await createProductionGoal({
      organization_id: organizationId,
      funnel_id: funnelId,
      name: `${year} Production Goal`,
      timeframe: 'yearly',
      start_date: `${year}-01-01`,
      end_date: `${year}-12-31`,
      target_units: targets.units,
      target_volume: targets.volume,
      target_revenue: targets.revenue,
    })
    result.goalCreated = true
  } catch (err) {
    // Goal generation is non-fatal — boards/dashboards should still land.
    console.warn('[provision] goal generation failed:', err)
  }

  // Map funnel stages → starter board groups so goal pacing reads live counts.
  try {
    await mapStarterFunnelStagesToGroups(organizationId)
  } catch (err) {
    console.warn('[provision] funnel stage mapping failed:', err)
  }

  // ── 3. Dashboards + widgets ───────────────────────────────────────────────
  for (const dash of DASHBOARD_TEMPLATES) {
    const isDefault = dash.key === personalization.default_dashboard_key
    const dashboardId = await createDashboard({
      organization_id: organizationId,
      name: dash.name,
      description: dash.description,
      icon: dash.icon,
      color: dash.color,
      is_default: isDefault,
    })
    result.dashboards++

    for (const w of dash.widgets) {
      const config = resolveWidgetConfig(w.config, boardMap, productionGoalId)
      // Skip goal widgets if the goal didn't get created.
      if ((w.config as Record<string, unknown>).useGoal && !productionGoalId) continue
      // Skip board widgets whose board is missing.
      if ((w.config as Record<string, unknown>).boardKey && config.board_id == null) continue
      await addWidget({
        dashboard_id: dashboardId,
        widget_type: w.widget_type,
        title: w.title,
        width: w.width,
        height: w.height ?? 1,
        config,
      })
      result.widgets++
    }
  }

  // ── 4. Workflows ──────────────────────────────────────────────────────────
  try {
    await ensureDefaultWorkflows(organizationId)
    const enabled = computeEnabledWorkflows(answers, weights)
    const { data: rows } = await supabase
      .from('workflows')
      .select('id, template_id')
      .eq('organization_id', organizationId)
    for (const row of rows ?? []) {
      const shouldEnable = enabled.has(row.template_id)
      await setWorkflowEnabled(row.id, shouldEnable)
      if (shouldEnable) result.workflowsEnabled++
    }
  } catch (err) {
    console.warn('[provision] workflow enablement failed:', err)
  }

  // ── 5. Setup checklist ────────────────────────────────────────────────────
  const checklistRows = SETUP_CHECKLIST.map((c, i) => ({
    organization_id: organizationId,
    item_key: c.item_key,
    title: c.title,
    description: c.description,
    icon: c.icon,
    action_href: c.action_href,
    position: i,
  }))
  if (checklistRows.length) {
    const { error: cErr } = await supabase
      .from('setup_checklist_items')
      .upsert(checklistRows, { onConflict: 'organization_id,item_key' })
    if (!cErr) result.checklistItems = checklistRows.length
  }

  // ── 6. Persist personalization + mark provisioned ─────────────────────────
  await supabase
    .from('onboarding_profiles')
    .update({
      personalization,
      provisioned: true,
      provisioned_at: new Date().toISOString(),
    })
    .eq('organization_id', organizationId)

  return result
}

// Resolve a widget config's `boardKey`/`useGoal` markers into real ids.
function resolveWidgetConfig(
  config: Record<string, unknown>,
  boardMap: Map<string, { id: string }>,
  goalId: string | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...config }
  if ('boardKey' in out) {
    const key = out.boardKey as string
    out.board_id = boardMap.get(key)?.id ?? null
    delete out.boardKey
  }
  if ('useGoal' in out) {
    out.production_goal_id = goalId
    delete out.useGoal
  }
  return out
}

// Apply the personalized board ordering to the template list.
function orderBoards(order: string[] | undefined) {
  if (!order || order.length === 0) return BOARD_TEMPLATES
  const byKey = new Map(BOARD_TEMPLATES.map(b => [b.key, b]))
  const ordered = order.map(k => byKey.get(k)).filter(Boolean) as typeof BOARD_TEMPLATES
  // Append any templates not named in the order.
  for (const b of BOARD_TEMPLATES) if (!order.includes(b.key)) ordered.push(b)
  return ordered
}
