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
}

export async function dispatchWorkflowEvent(event: WorkflowEvent, ctx?: DispatchContext): Promise<void> {
  try {
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
      // eslint-disable-next-line no-await-in-loop
      await runWorkflow(wf, event, record, userId, supabase)
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
): Promise<void> {
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
