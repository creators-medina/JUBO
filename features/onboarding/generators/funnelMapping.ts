// ─────────────────────────────────────────────────────────────────────────
// Funnel stage → board group mapping.
//
// Sets funnel_stages.board_group_id for the starter Production Funnel so goal
// pacing reads live record counts (the /today cockpit counts records in the
// final stage's board group). Idempotent — only fills stages that are unmapped,
// so it's safe to call at provisioning AND after every import.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { STARTER_FUNNEL, STAGE_GROUP_MAP } from '../templates/goals'

export async function mapStarterFunnelStagesToGroups(organizationId: string): Promise<number> {
  const supabase = await createClient()

  // Find the starter funnel.
  const { data: funnels } = await supabase
    .from('funnels')
    .select('id, name')
    .eq('organization_id', organizationId)
  const funnel = funnels?.find((f) => f.name === STARTER_FUNNEL.funnelName) ?? funnels?.[0]
  if (!funnel) return 0

  const { data: stages } = await supabase
    .from('funnel_stages')
    .select('id, slug, board_group_id')
    .eq('funnel_id', funnel.id)
  if (!stages || stages.length === 0) return 0

  // slug → stage key (from the template definition).
  const slugToKey = new Map(STARTER_FUNNEL.stages.map((s) => [s.slug, s.key]))

  // Board slugs we need, and their groups.
  const boardSlugs = [...new Set(Object.values(STAGE_GROUP_MAP).map((m) => m.boardSlug))]
  const { data: boards } = await supabase
    .from('boards')
    .select('id, slug')
    .eq('organization_id', organizationId)
    .in('slug', boardSlugs)
  if (!boards || boards.length === 0) return 0
  const boardIdBySlug = new Map(boards.map((b) => [b.slug, b.id]))

  const { data: groups } = await supabase
    .from('board_groups')
    .select('id, name, board_id')
    .in('board_id', boards.map((b) => b.id))
  const groupId = (boardId: string, name: string) =>
    groups?.find((g) => g.board_id === boardId && g.name === name)?.id

  let mapped = 0
  for (const stage of stages) {
    if (stage.board_group_id) continue // already mapped
    const key = slugToKey.get(stage.slug)
    const target = key ? STAGE_GROUP_MAP[key] : undefined
    if (!target) continue
    const boardId = boardIdBySlug.get(target.boardSlug)
    if (!boardId) continue
    const gid = groupId(boardId, target.groupName)
    if (!gid) continue
    const { error } = await supabase
      .from('funnel_stages')
      .update({ board_group_id: gid })
      .eq('id', stage.id)
    if (!error) mapped++
  }
  return mapped
}
