'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { templatesInstallPayload } from './registry/templates'
import { runWorkflowScans } from './triggers/scan'
import { getBoardAutomations } from './queries'
import type { WorkflowRow } from './types'

/** Install (idempotently) the code templates as workflow rows for the org. */
export async function ensureDefaultWorkflows(organizationId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('ensure_default_workflows', {
    p_organization_id: organizationId,
    p_templates: templatesInstallPayload(),
  })
  if (error) throw new Error(error.message)
  revalidatePath('/settings/workflows')
}

export async function setWorkflowEnabled(workflowId: string, enabled: boolean): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_workflow_enabled', {
    p_workflow_id: workflowId,
    p_enabled: enabled,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/settings/workflows')
}

/**
 * Create a board-scoped "status → move to group" automation (Phase 34B).
 * Stored as a custom workflow row (config drives the engine). Org-member gated
 * inside the RPC. Board/field/group ids come from the live board.
 */
export async function createStatusAutomation(input: {
  organizationId: string
  /** Source board — the workflow is scoped here and matches events on this board. */
  boardId: string
  fieldId: string
  fieldSlug: string
  toValue: string
  /** Optional: only fire when the record is currently in this group. */
  sourceGroupId?: string | null
  /** Destination — defaults to the source board when omitted. */
  destBoardId?: string
  /** Destination group (on the destination board) — required for 'specific'. */
  groupId?: string
  /** 'specific' (fixed group, default) or 'next' (Phase 38D-1 dynamic next group). */
  targetMode?: 'specific' | 'next'
  title: string
}): Promise<string> {
  const supabase = await createClient()
  const templateId = `custom:status_to_group:${crypto.randomUUID()}`
  const isNext = input.targetMode === 'next'
  const destBoardId = input.destBoardId ?? input.boardId
  const crossBoard = !isNext && destBoardId !== input.boardId
  if (!isNext && !input.groupId) throw new Error('A destination group is required.')
  // Phase 38D-1 — dynamic action: next group is resolved at execution time (same
  // board). Specific keeps the fixed-target shape. Same execution path either way.
  const action = isNext
    ? { type: 'move_to_next_group' }
    : { type: crossBoard ? 'move_to_board_group' : 'move_to_group', boardId: destBoardId, groupId: input.groupId }
  const config = {
    kind: 'status_to_group',
    trigger: { type: 'record.field_changed', fieldId: input.fieldId, fieldSlug: input.fieldSlug, fieldType: 'status', toValue: input.toValue },
    condition: input.sourceGroupId ? { sourceGroupId: input.sourceGroupId } : {},
    action,
  }
  const { data, error } = await supabase.rpc('create_custom_workflow', {
    p_organization_id: input.organizationId,
    p_board_id: input.boardId,
    p_template_id: templateId,
    p_title: input.title,
    p_trigger_type: 'record.field_changed',
    p_config: config,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${input.boardId}`)
  revalidatePath('/settings/workflows')
  return data as string
}

/** List a board's custom automations (client-callable wrapper over the query). */
export async function listBoardAutomations(boardId: string): Promise<WorkflowRow[]> {
  return getBoardAutomations(boardId)
}

/** Delete a workflow (custom automation). Org-member gated inside the RPC. */
export async function deleteWorkflow(workflowId: string, boardId?: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_workflow', { p_workflow_id: workflowId })
  if (error) throw new Error(error.message)
  if (boardId) revalidatePath(`/boards/${boardId}`)
  revalidatePath('/settings/workflows')
}

/** Manually run the scheduled scans (no-activity + overdue-next-action). */
export async function runWorkflowScansAction(organizationId: string): Promise<{ scanned: number }> {
  const result = await runWorkflowScans(organizationId)
  revalidatePath('/settings/workflows')
  revalidatePath('/today')
  return result
}
