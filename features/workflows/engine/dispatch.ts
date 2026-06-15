import { createClient } from '@/lib/supabase/server'
import { templateById } from '../registry/templates'
import { evaluateAll } from './conditions'
import { executeAction, type ExecutedAction } from './actions'
import type { WorkflowEvent, WorkflowRecordSnapshot, WorkflowRow } from '../types'

// ── The operational nervous system ──────────────────────────────────────────
//
// dispatchWorkflowEvent is called from user-initiated server actions (moveRecord,
// createRecord) and from scheduled scans. It loads enabled workflows for the
// org + trigger, evaluates conditions, executes actions idempotently, and logs
// an immutable execution row.
//
// Loop safety: workflow actions use direct inserts / dedicated RPCs and never
// re-dispatch events. This module is the ONLY producer of executions.

// ctx lets callers inject a client + acting user. Headless/system callers
// (the cron worker, using the service-role admin client) pass both, so the
// engine runs without auth.uid(). Without ctx, behaves exactly as before:
// SSR client + the current authenticated user.
export type DispatchContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client?: any
  userId?: string | null
  /** Recursion depth — automation-initiated dispatches increment this. */
  depth?: number
}

// Backstop against automation cascades (e.g. status→move→group_changed→…).
const MAX_DISPATCH_DEPTH = 4

export async function dispatchWorkflowEvent(event: WorkflowEvent, ctx?: DispatchContext): Promise<void> {
  try {
    const depth = ctx?.depth ?? 0
    if (depth > MAX_DISPATCH_DEPTH) return // loop guard

    const supabase = ctx?.client ?? await createClient()
    let userId = ctx?.userId ?? null
    if (!userId) {
      const { data: { user } } = await supabase.auth.getUser()
      userId = user?.id ?? null
    }
    if (!userId) return // generated items need an owner

    // Load enabled workflows matching the trigger
    const { data: workflows } = await supabase
      .from('workflows')
      .select('*')
      .eq('organization_id', event.organizationId)
      .eq('trigger_type', event.type)
      .eq('enabled', true)
    if (!workflows || workflows.length === 0) return

    // Resolve a record snapshot once (most triggers are record-scoped)
    const record = event.record ?? await loadRecordSnapshot(supabase, event.recordId)
    if (!record) return

    for (const wf of workflows as WorkflowRow[]) {
      // Board-scoped rules only run for their board (null = org-wide).
      if (wf.board_id && event.boardId && wf.board_id !== event.boardId) continue
      if (wf.board_id && !event.boardId && wf.board_id !== record.board_id) continue
      // eslint-disable-next-line no-await-in-loop
      await runWorkflow(wf, event, record, userId, supabase, depth)
    }
  } catch (err) {
    // Best-effort: a workflow failure must never break the user's primary action
    console.warn('[workflows] dispatch failed:', err instanceof Error ? err.message : err)
  }
}

async function runWorkflow(
  wf: WorkflowRow,
  event: WorkflowEvent,
  record: WorkflowRecordSnapshot,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  depth: number,
): Promise<void> {
  // Custom (DB-defined) rules run from config; code rules from the registry.
  const cfg = wf.config as Record<string, unknown> | null
  if (cfg && cfg.kind === 'status_to_group') {
    await runStatusToGroup(wf, cfg, event, record, userId, supabase, depth)
    return
  }

  const template = templateById(wf.template_id)
  if (!template) return

  const passed = await evaluateAll(template.conditions, event, record, supabase)
  if (!passed) {
    await logExecution(supabase, event, wf, [], 'skipped')
    return
  }

  const executed: ExecutedAction[] = []
  let status: 'success' | 'partial' | 'failed' = 'success'
  for (const action of template.actions) {
    try {
      // eslint-disable-next-line no-await-in-loop
      const result = await executeAction(action, record, userId, supabase)
      executed.push(result)
    } catch (err) {
      executed.push({ kind: action.kind, detail: err instanceof Error ? err.message : 'failed', skipped: false })
      status = executed.length === 0 ? 'failed' : 'partial'
    }
  }

  await logExecution(supabase, event, wf, executed, status)
}

/**
 * Phase 34B — "when status changes to <label>, move item to <group>".
 * Matches the field_changed event against the rule, then moves the record via
 * the safe move_record RPC (logs movement + activity). The downstream
 * record.group_changed is dispatched with depth+1 so the loop guard applies.
 */
async function runStatusToGroup(
  wf: WorkflowRow,
  cfg: Record<string, unknown>,
  event: WorkflowEvent,
  record: WorkflowRecordSnapshot,
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  depth: number,
): Promise<void> {
  const trigger = (cfg.trigger ?? {}) as { fieldId?: string; fieldType?: string; toValue?: string }
  const condition = (cfg.condition ?? {}) as { sourceGroupId?: string | null }
  const action = (cfg.action ?? {}) as { type?: string; boardId?: string | null; groupId?: string }

  // Defensive match (34A already guarantees a real change + status/select type).
  const matches =
    event.type === 'record.field_changed' &&
    event.fieldType === 'status' &&
    !!trigger.fieldId && event.fieldId === trigger.fieldId &&
    (event.toValue ?? null) === (trigger.toValue ?? null) &&
    event.fromValue !== event.toValue
  if (!matches) { await logExecution(supabase, event, wf, [], 'skipped'); return }

  // Source-group condition (Phase 34B.1) — record.group_id is the PRE-move group
  // (the snapshot is loaded before any move). Absent condition → runs board-wide.
  if (condition.sourceGroupId && record.group_id !== condition.sourceGroupId) {
    await logExecution(supabase, event, wf, [], 'skipped'); return
  }

  const toGroupId = action.groupId
  if (!toGroupId) { await logExecution(supabase, event, wf, [], 'skipped'); return }

  // Resolve the destination group + its board; default destination board = current.
  const { data: grp } = await supabase
    .from('board_groups').select('id, name, board_id, is_archived').eq('id', toGroupId).maybeSingle()
  const destBoardId = action.boardId ?? record.board_id
  if (!grp || grp.is_archived || grp.board_id !== destBoardId) {
    await logExecution(supabase, event, wf, [{ kind: 'move', detail: 'destination group not on destination board', skipped: true }], 'skipped')
    return
  }
  // Already there → nothing to do.
  if (record.group_id === toGroupId && record.board_id === destBoardId) {
    await logExecution(supabase, event, wf, [], 'skipped'); return
  }

  const fromGroupId = record.group_id
  const crossBoard = destBoardId !== record.board_id

  if (crossBoard) {
    // Phase 32A safe cross-board move (validates org + board/group invariant, cascades subitems).
    const { data, error } = await supabase.rpc('move_record_to_board', {
      p_record_id: record.id,
      p_to_board_id: destBoardId,
      p_to_group_id: toGroupId,
      p_moved_by: userId,
    })
    const res = (data ?? {}) as Record<string, unknown>
    if (error || res.error) {
      await logExecution(supabase, event, wf, [{ kind: 'move_to_board_group', detail: String(error?.message ?? res.error), skipped: false }], 'failed')
      return
    }
  } else {
    const { error } = await supabase.rpc('move_record', {
      p_record_id: record.id,
      p_to_group_id: toGroupId,
      p_moved_by: userId,
      p_movement_type: 'stage_change',
    })
    if (error) {
      await logExecution(supabase, event, wf, [{ kind: 'move_to_group', detail: error.message, skipped: false }], 'failed')
      return
    }
  }

  await logExecution(supabase, event, wf, [{ kind: crossBoard ? 'move_to_board_group' : 'move_to_group', detail: `→ ${grp.name}`, skipped: false }], 'success')

  // Let downstream group-based workflows react — depth-guarded against loops.
  await dispatchWorkflowEvent(
    { type: 'record.group_changed', organizationId: event.organizationId, recordId: record.id, boardId: destBoardId, fromGroupId, toGroupId, toGroupName: grp.name },
    { client: supabase, userId, depth: depth + 1 },
  )
}

async function logExecution(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  event: WorkflowEvent,
  wf: WorkflowRow,
  executed: ExecutedAction[],
  status: string,
): Promise<void> {
  await supabase.rpc('log_workflow_execution', {
    p_organization_id: event.organizationId,
    p_workflow_id: wf.id,
    p_template_id: wf.template_id,
    p_trigger_type: event.type,
    p_record_id: event.recordId,
    p_payload: { fromGroupId: event.fromGroupId ?? null, toGroupId: event.toGroupId ?? null, toGroupName: event.toGroupName ?? null },
    p_actions_executed: executed,
    p_status: status,
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadRecordSnapshot(supabase: any, recordId: string): Promise<WorkflowRecordSnapshot | null> {
  const { data: r } = await supabase
    .from('records')
    .select('id, organization_id, board_id, group_id, title, status, priority, next_action, next_action_due_at, next_action_completed_at, updated_at')
    .eq('id', recordId)
    .single()
  if (!r) return null

  let group_name: string | null = null
  let board_type: string | null = null
  if (r.group_id) {
    const { data: g } = await supabase.from('board_groups').select('name').eq('id', r.group_id).single()
    group_name = g?.name ?? null
  }
  const { data: b } = await supabase.from('boards').select('board_type').eq('id', r.board_id).single()
  board_type = b?.board_type ?? null

  return { ...r, group_name, board_type } as WorkflowRecordSnapshot
}
