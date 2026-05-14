import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboards } from '@/features/dashboards/queries'
import { DashboardHubClient } from './DashboardHubClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const dashboards = await getDashboards(orgId)

  // Redirect to the first dashboard if one exists
  if (dashboards.length > 0) {
    const defaultDash = dashboards.find(d => d.is_default) ?? dashboards[0]
    redirect(`/dashboards/${defaultDash.id}`)
  }

  // No dashboards yet — show create-first-dashboard hub
  const org = membership.organizations as any
  return <DashboardHubClient organizationId={orgId} orgName={org?.name ?? 'Your workspace'} />
}
