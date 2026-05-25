import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ensureDefaultWorkflows } from '@/features/workflows/actions'
import { getWorkflows, getRecentExecutions } from '@/features/workflows/queries'
import { WorkflowsClient } from '@/features/workflows/components/WorkflowsClient'

export const dynamic = 'force-dynamic'

export default async function WorkflowsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  // Idempotently install the default templates, then load
  try { await ensureDefaultWorkflows(orgId) } catch { /* best-effort */ }

  const [workflows, executions] = await Promise.all([
    getWorkflows(orgId),
    getRecentExecutions(orgId, 15),
  ])

  return <WorkflowsClient organizationId={orgId} workflows={workflows} executions={executions} />
}
