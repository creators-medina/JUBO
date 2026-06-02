import { createClient } from '@/lib/supabase/server'

export type OrganizationSettings = {
  id: string
  name: string
  slug: string
  logo_url: string | null
  timezone: string
  team_size: number | null
  monthly_volume_goal: number | null
  status: string
}

/** Load the settings-relevant columns for an org. Returns null if not found / no access (RLS). */
export async function getOrganizationSettings(orgId: string): Promise<OrganizationSettings | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, timezone, team_size, monthly_volume_goal, status')
    .eq('id', orgId)
    .maybeSingle()
  return (data as OrganizationSettings | null) ?? null
}

export async function getUserOrganizations() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data } = await supabase
    .from('organization_members')
    .select('role, organizations(id, name, slug, owner_user_id, created_at, updated_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  return (data ?? []).map((m: any) => ({
    ...m.organizations,
    role: m.role,
  }))
}
