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
  boardId: string
  fieldId: string
  fieldSlug: string
  toValue: string
  groupId: string
  title: string
}): Promise<string> {
  const supabase = await createClient()
  const templateId = `custom:status_to_group:${crypto.randomUUID()}`
  const config = {
    kind: 'status_to_group',
    trigger: { type: 'record.field_changed', fieldId: input.fieldId, fieldSlug: input.fieldSlug, fieldType: 'status', toValue: input.toValue },
    action: { type: 'move_to_group', groupId: input.groupId },
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
