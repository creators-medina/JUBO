import { createClient } from '@/lib/supabase/server'
import { hashToken } from './inviteToken'

export type InvitationPreview = {
  found: boolean
  email?: string
  role?: string
  status?: string
  expired?: boolean
  organizationName?: string
}

/** Resolve an invite token to display details. Works for logged-out users (DEFINER RPC). */
export async function getInvitationPreview(token: string): Promise<InvitationPreview> {
  const supabase = await createClient()
  const { data } = await supabase.rpc('invitation_preview', { p_token_hash: hashToken(token) })
  const r = (data ?? { found: false }) as Record<string, unknown>
  if (!r.found) return { found: false }
  return {
    found: true,
    email: r.email as string,
    role: r.role as string,
    status: r.status as string,
    expired: !!r.expired,
    organizationName: r.organization_name as string,
  }
}

export type PendingInvite = {
  id: string
  email: string
  name: string
  role: string
  expiresAt: string
  createdAt: string
}

/** Pending invitations for the Team page (RLS scopes to admins of the org). */
export async function getPendingInvitations(orgId: string): Promise<PendingInvite[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_invitations')
    .select('id, email, first_name, last_name, role, expires_at, created_at')
    .eq('organization_id', orgId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return ((data as any[]) ?? []).map((i) => ({
    id: i.id,
    email: i.email,
    name: `${i.first_name ?? ''} ${i.last_name ?? ''}`.trim(),
    role: i.role,
    expiresAt: i.expires_at,
    createdAt: i.created_at,
  }))
}

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

export type TeamMember = {
  membershipId: string
  userId: string
  name: string
  email: string
  role: string
  status: string
  joinedAt: string | null
  isSelf: boolean
}

/**
 * Load every member of an org (active + disabled) with their profile, for the
 * Team settings page. RLS already scopes this to orgs the caller belongs to;
 * profiles are readable via the co-member SELECT policy.
 */
export async function getTeamMembers(orgId: string, currentUserId: string): Promise<TeamMember[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organization_members')
    .select('id, user_id, role, status, joined_at, created_at, profiles(first_name, last_name, email)')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: true })

  return ((data as any[]) ?? []).map((m) => {
    const p = m.profiles as { first_name: string | null; last_name: string | null; email: string | null } | null
    const name = `${p?.first_name ?? ''} ${p?.last_name ?? ''}`.trim()
    return {
      membershipId: m.id,
      userId: m.user_id,
      name: name || '—',
      email: p?.email ?? '—',
      role: m.role,
      status: m.status ?? 'active',
      joinedAt: m.joined_at ?? m.created_at ?? null,
      isSelf: m.user_id === currentUserId,
    }
  })
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
