import { createClient } from '@/lib/supabase/server'
import type { WorkflowRow, WorkflowExecutionRow } from './types'

export async function getWorkflows(organizationId: string): Promise<WorkflowRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workflows')
    .select('*')
    .eq('organization_id', organizationId)
    .order('title', { ascending: true })
  return (data ?? []) as WorkflowRow[]
}

export async function getRecentExecutions(organizationId: string, limit = 20): Promise<WorkflowExecutionRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('workflow_executions')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as WorkflowExecutionRow[]
}
