import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeamMembers, getPendingInvitations } from '@/features/organizations/queries'
import { isOrgAdmin } from '@/features/auth/guards'
import { TeamClient } from '@/features/organizations/TeamClient'

export const dynamic = 'force-dynamic'

export default async function TeamSettingsPage() {
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
  const canManage = isOrgAdmin(m.role)
  const [members, pendingInvites] = await Promise.all([
    getTeamMembers(m.organization_id, user.id),
    canManage ? getPendingInvitations(m.organization_id) : Promise.resolve([]),
  ])

  // All members can view the roster; only owner/admin see + use the actions.
  return (
    <TeamClient
      members={members}
      pendingInvites={pendingInvites}
      canManage={canManage}
      currentRole={m.role}
      currentUserId={user.id}
    />
  )
}
