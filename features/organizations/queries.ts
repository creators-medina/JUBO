import { createClient } from '@/lib/supabase/server'

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
