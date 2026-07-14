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
  // Never throw — the public invite page renders this for logged-out users and
  // must degrade to a friendly "invalid link" state on any failure.
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('invitation_preview', { p_token_hash: hashToken(token) })
    if (error) return { found: false }
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
  } catch {
    return { found: false }
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

export type OrgBilling = {
  plan_type: string
  billing_status: string
  seat_limit: number | null
  seats_used: number
  trial_ends_at: string | null
  current_period_end: string | null
  /** Whether Stripe IDs are present (never the raw ids in the UI). */
  stripe_linked: boolean
}

/**
 * Read-only billing/seat snapshot for the Organization settings display.
 * Purely observational — never gates app access. `seats_used` is the live
 * count of active members. Stripe IDs are reduced to a boolean for the UI.
 */
export async function getOrgBilling(orgId: string): Promise<OrgBilling | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('organizations')
    .select('plan_type, billing_status, seat_limit, trial_ends_at, current_period_end, stripe_customer_id, stripe_subscription_id')
    .eq('id', orgId)
    .maybeSingle()
  if (!data) return null
  const o = data as {
    plan_type: string; billing_status: string; seat_limit: number | null
    trial_ends_at: string | null; current_period_end: string | null
    stripe_customer_id: string | null; stripe_subscription_id: string | null
  }
  const { count } = await supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', orgId)
    .eq('status', 'active')
  return {
    plan_type: o.plan_type,
    billing_status: o.billing_status,
    seat_limit: o.seat_limit,
    seats_used: count ?? 0,
    trial_ends_at: o.trial_ends_at,
    current_period_end: o.current_period_end,
    stripe_linked: !!(o.stripe_customer_id || o.stripe_subscription_id),
  }
}

export type TeamMember = {
  membershipId: string
  userId: string
  name: string
  email: string
  role: string
  status: string
  memberType: string
  joinedAt: string | null
  isSelf: boolean
}

export type SupportLink = {
  id: string
  producerUserId: string
  supportUserId: string
}

/** Support→producer links for the org (RLS scopes to org members). */
export async function getSupportLinks(orgId: string): Promise<SupportLink[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('producer_support_links')
    .select('id, producer_user_id, support_user_id')
    .eq('organization_id', orgId)
  return ((data as any[]) ?? []).map((l) => ({
    id: l.id,
    producerUserId: l.producer_user_id,
    supportUserId: l.support_user_id,
  }))
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
    .select('id, user_id, role, status, member_type, joined_at, created_at, profiles(first_name, last_name, email)')
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
      memberType: m.member_type ?? 'producer',
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
