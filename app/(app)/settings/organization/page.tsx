import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationSettings, getOrgBilling } from '@/features/organizations/queries'
import { isOrgAdmin } from '@/features/auth/guards'
import { OrganizationSettingsClient } from '@/features/organizations/OrganizationSettingsClient'

export const dynamic = 'force-dynamic'

export default async function OrganizationSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/onboarding')

  const m = membership as { organization_id: string; role: string }
  const canEdit = isOrgAdmin(m.role)
  const [org, billing] = await Promise.all([
    getOrganizationSettings(m.organization_id),
    canEdit ? getOrgBilling(m.organization_id) : Promise.resolve(null),
  ])
  if (!org) redirect('/settings')

  // Owner/Admin can edit + see billing; everyone else views read-only.
  return <OrganizationSettingsClient org={org} billing={billing} canEdit={canEdit} role={m.role} />
}
