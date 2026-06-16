// ─────────────────────────────────────────────────────────────────────────
// Pipeline movement engine.
//
// Maps an external milestone/status → a board group (configurable per org via
// integration_stage_mappings; code defaults otherwise), resolved by slug + name
// at runtime — never hardcoded ids, never coupled to a specific org. Moving a
// record fires record.group_changed, which the Phase 14 workflow engine reacts
// to (generating milestone tasks).
//
// SAFETY: a backward move (incoming stage earlier than the record's current
// stage) is ignored by default and logged — stale upstream events can't drag a
// Funded file back to Processing.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import type { SystemExecutionContext } from './context'
import { loadStageMappings, resolveTarget, currentStageOrder } from './stageMapping'
import type { NormalizedEvent } from '../types'

export type MovementResult = { moved: boolean; toGroupName?: string; ignoredRegression?: boolean }

export async function applyPipelineMovement(
  supabase: SupabaseClient,
  ctx: SystemExecutionContext,
  recordId: string,
  current: { board_id: string | null; group_id: string | null },
  ev: NormalizedEvent,
  opts: { allowBackward?: boolean } = {},
): Promise<MovementResult> {
  const mappings = await loadStageMappings(supabase, ctx.organizationId)
  const target = resolveTarget(mappings, ev)
  if (!target) return { moved: false }

  // Resolve the target board (slug) + group (name) for this org.
  const { data: board } = await supabase
    .from('boards').select('id, slug')
    .eq('organization_id', ctx.organizationId).eq('slug', target.boardSlug).eq('is_archived', false).maybeSingle()
  if (!board) return { moved: false }
  const { data: group } = await supabase
    .from('board_groups').select('id, name').eq('board_id', board.id).eq('name', target.groupName).maybeSingle()
  if (!group) return { moved: false }
  if (current.group_id === group.id) return { moved: false } // already there

  // Backward-movement guard.
  if (!opts.allowBackward && current.board_id && current.group_id) {
    const [{ data: curBoard }, { data: curGroup }] = await Promise.all([
      supabase.from('boards').select('slug').eq('id', current.board_id).maybeSingle(),
      supabase.from('board_groups').select('name').eq('id', current.group_id).maybeSingle(),
    ])
    const curOrder = currentStageOrder(mappings, curBoard?.slug ?? null, curGroup?.name ?? null)
    if (curOrder != null && target.stageOrder < curOrder) {
      // Stale/old status — ignore and log.
      await supabase.from('activities').insert({
        organization_id: ctx.organizationId, record_id: recordId, user_id: ctx.userId,
        activity_type: 'integration_event',
        content: `Ignored backward stage update (${curGroup?.name} → ${group.name}) from ${ev.sourceProvider}`,
        metadata: { source: ctx.source, ignored_regression: true, from_order: curOrder, to_order: target.stageOrder },
      })
      return { moved: false, ignoredRegression: true }
    }
  }

  // Move (board + group together — movement can cross boards). Bypasses RLS under admin.
  const { error } = await supabase
    .from('records')
    .update({ board_id: board.id, group_id: group.id, updated_at: new Date().toISOString() })
    .eq('id', recordId)
  if (error) throw new Error(error.message)

  // Phase 34B.2b — reset the destination board's default workflow status for the
  // current stage (silent SQL delete; never emits record.field_changed).
  await supabase.rpc('reset_default_status', { p_record_id: recordId, p_board_id: board.id })

  // Phase 36C-1 — carry common fields into empty destination fields (silent SQL;
  // cross-board only, no-op when from/to board match). Parent record only.
  if (current.board_id && current.board_id !== board.id) {
    await supabase.rpc('carry_common_fields', {
      p_record_id: recordId,
      p_from_board_id: current.board_id,
      p_to_board_id: board.id,
      p_actor_user_id: ctx.userId ?? null,
    })
  }

  await supabase.from('activities').insert({
    organization_id: ctx.organizationId, record_id: recordId, user_id: ctx.userId,
    activity_type: 'status_change',
    content: `Moved to ${group.name} from ${ev.sourceProvider}`,
    metadata: { source: ctx.source, actor_type: ctx.actorType, from_group_id: current.group_id, to_group_id: group.id, milestone: ev.loan.milestone ?? ev.loan.status },
  })

  await dispatchWorkflowEvent(
    { type: 'record.group_changed', organizationId: ctx.organizationId, recordId, fromGroupId: current.group_id, toGroupId: group.id, toGroupName: group.name },
    { client: supabase, userId: ctx.userId },
  )

  return { moved: true, toGroupName: group.name }
}
