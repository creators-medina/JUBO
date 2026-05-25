// ─────────────────────────────────────────────────────────────────────────
// Pipeline movement engine.
//
// Maps an external milestone/status → a starter board group, resolved by SLUG +
// NAME at runtime (never hardcoded ids, never coupled to a specific org). Moving
// a record fires record.group_changed, which the Phase 14 workflow engine reacts
// to (generating the milestone tasks). Safe fallback: unknown statuses don't move.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import type { SystemExecutionContext } from './context'
import type { NormalizedEvent } from '../types'

type MovementRule = { keywords: string[]; boardSlug: string; groupName: string }

// Ordered most-advanced → least, so "clear to close" wins over "close", etc.
// Configurable here, not in the DB; resolved against the org's starter boards.
export const MILESTONE_GROUP_MAP: MovementRule[] = [
  { keywords: ['funded', 'funding', 'closed'],              boardSlug: 'loan-pipeline', groupName: 'Funded' },
  { keywords: ['clear to close', 'ctc', 'cleared'],         boardSlug: 'loan-pipeline', groupName: 'Clear to Close' },
  { keywords: ['condition'],                                boardSlug: 'loan-pipeline', groupName: 'Conditions' },
  { keywords: ['processing', 'in process', 'submitted'],    boardSlug: 'loan-pipeline', groupName: 'Processing' },
  { keywords: ['under contract', 'in contract', 'contract'],boardSlug: 'active-leads',  groupName: 'Under Contract' },
  { keywords: ['preapprov', 'pre-approv', 'pre approv'],    boardSlug: 'active-leads',  groupName: 'Preapproved' },
  { keywords: ['shopping', 'prequal', 'pre-qual'],          boardSlug: 'active-leads',  groupName: 'Shopping' },
  { keywords: ['credit', 'application', 'applied'],         boardSlug: 'active-leads',  groupName: 'Credit Pull' },
  { keywords: ['new', 'inquiry', 'lead'],                   boardSlug: 'active-leads',  groupName: 'New Inquiry' },
]

export function resolveMovementTarget(ev: NormalizedEvent): { boardSlug: string; groupName: string } | null {
  const text = `${ev.loan.milestone ?? ''} ${ev.loan.status ?? ''}`.toLowerCase()
  if (!text.trim()) return null
  for (const rule of MILESTONE_GROUP_MAP) {
    if (rule.keywords.some((k) => text.includes(k))) return { boardSlug: rule.boardSlug, groupName: rule.groupName }
  }
  return null
}

/**
 * Move `recordId` to the group implied by the event's milestone/status.
 * Returns the destination group name when a move happened, else null.
 */
export async function applyPipelineMovement(
  supabase: SupabaseClient,
  ctx: SystemExecutionContext,
  recordId: string,
  current: { board_id: string | null; group_id: string | null },
  ev: NormalizedEvent,
): Promise<string | null> {
  const target = resolveMovementTarget(ev)
  if (!target) return null

  // Resolve the target board (by slug) and group (by name) for this org.
  const { data: board } = await supabase
    .from('boards')
    .select('id')
    .eq('organization_id', ctx.organizationId)
    .eq('slug', target.boardSlug)
    .eq('is_archived', false)
    .maybeSingle()
  if (!board) return null

  const { data: group } = await supabase
    .from('board_groups')
    .select('id, name')
    .eq('board_id', board.id)
    .eq('name', target.groupName)
    .maybeSingle()
  if (!group) return null

  // Already there — nothing to do (idempotent).
  if (current.group_id === group.id) return null

  // Update board + group together (movement may cross boards). Member RLS.
  const { error } = await supabase
    .from('records')
    .update({ board_id: board.id, group_id: group.id, updated_at: new Date().toISOString() })
    .eq('id', recordId)
  if (error) throw new Error(error.message)

  // Movement audit.
  await supabase.from('activities').insert({
    organization_id: ctx.organizationId,
    record_id: recordId,
    user_id: ctx.userId,
    activity_type: 'status_change',
    content: `Moved to ${group.name} from ${ev.sourceProvider}`,
    metadata: { source: ctx.source, from_group_id: current.group_id, to_group_id: group.id, milestone: ev.loan.milestone ?? ev.loan.status },
  })

  // Fire the stage-change workflow trigger (generates milestone tasks via Phase 14).
  await dispatchWorkflowEvent({
    type: 'record.group_changed',
    organizationId: ctx.organizationId,
    recordId,
    fromGroupId: current.group_id,
    toGroupId: group.id,
    toGroupName: group.name,
  })

  return group.name
}
