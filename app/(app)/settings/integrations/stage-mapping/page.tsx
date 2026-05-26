import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getStageMappings } from '@/features/integrations/queries'
import { StageMappingClient } from '@/features/integrations/setup/StageMappingClient'

export const dynamic = 'force-dynamic'

export default async function StageMappingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')

  const mappings = await getStageMappings(membership.organization_id)
  return <StageMappingClient organizationId={membership.organization_id} mappings={mappings} />
}
