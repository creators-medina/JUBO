import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getConnections, getRecentEvents } from '@/features/integrations/queries'
import { IntegrationsClient } from '@/features/integrations/setup/IntegrationsClient'

export const dynamic = 'force-dynamic'

export default async function SettingsIntegrationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  const [connections, events] = await Promise.all([
    getConnections(orgId),
    getRecentEvents(orgId),
  ])

  return <IntegrationsClient organizationId={orgId} connections={connections} events={events} />
}
