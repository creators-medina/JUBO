'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { templatesInstallPayload } from './registry/templates'
import { runWorkflowScans } from './triggers/scan'

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

/** Manually run the scheduled scans (no-activity + overdue-next-action). */
export async function runWorkflowScansAction(organizationId: string): Promise<{ scanned: number }> {
  const result = await runWorkflowScans(organizationId)
  revalidatePath('/settings/workflows')
  revalidatePath('/today')
  return result
}
