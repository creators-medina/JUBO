'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgRole } from '@/features/auth/guards'
import { generateToken, hashToken } from './inviteToken'
import type { OrgRole } from '@/types/database'

const INVITABLE_ROLES: OrgRole[] = ['admin', 'manager', 'member']
const EXPIRY_DAYS = 7

export type InviteResult = { ok: true; token: string } | { error: string }
export type SimpleResult = { ok: true } | { error: string }

function expiresAt(): string {
  return new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Create an invitation. Owner/Admin only. Returns the plaintext token (shown
 * once so the inviter can copy the link); only the hash is stored.
 */
export async function inviteMember(input: {
  firstName: string
  lastName: string
  email: string
  role: string
}): Promise<InviteResult> {
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch (e) {
    return { error: e instanceof Error && e.message === 'Forbidden' ? 'forbidden' : 'unauthorized' }
  }

  const email = input.email.trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: 'invalid_email' }
  const role = input.role
  if (!INVITABLE_ROLES.includes(role as OrgRole)) return { error: 'invalid_role' }

  // Already a member of this org? (match the email to a profile that's a member)
  const { data: prof } = await ctx.supabase.from('profiles').select('id').eq('email', email).maybeSingle()
  if (prof?.id) {
    const { data: existing } = await ctx.supabase
      .from('organization_members').select('id')
      .eq('organization_id', ctx.orgId).eq('user_id', prof.id).maybeSingle()
    if (existing) return { error: 'already_member' }
  }

  const token = generateToken()
  const { error } = await ctx.supabase.from('organization_invitations').insert({
    organization_id: ctx.orgId,
    email,
    first_name: input.firstName.trim() || null,
    last_name: input.lastName.trim() || null,
    role,
    token_hash: hashToken(token),
    invited_by: ctx.user.id,
    status: 'pending',
    expires_at: expiresAt(),
  })
  if (error) {
    // Partial unique index → a pending invite for this email already exists.
    if (error.code === '23505') return { error: 'already_invited' }
    return { error: error.message }
  }

  revalidatePath('/settings/team')
  return { ok: true, token }
}

/** Revoke a pending invite. Owner/Admin only. */
export async function revokeInvitation(inviteId: string): Promise<SimpleResult> {
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch {
    return { error: 'forbidden' }
  }
  const { error } = await ctx.supabase
    .from('organization_invitations')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('organization_id', ctx.orgId)
    .eq('status', 'pending')
  if (error) return { error: error.message }
  revalidatePath('/settings/team')
  return { ok: true }
}

/**
 * Rotate an invite's token (and reset its 7-day clock) and return the fresh
 * plaintext token. Doubles as "resend" / "copy link" while email is not wired:
 * the previous link stops working. Owner/Admin only.
 */
export async function refreshInviteLink(inviteId: string): Promise<InviteResult> {
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch {
    return { error: 'forbidden' }
  }
  const token = generateToken()
  const { data, error } = await ctx.supabase
    .from('organization_invitations')
    .update({ token_hash: hashToken(token), status: 'pending', expires_at: expiresAt() })
    .eq('id', inviteId)
    .eq('organization_id', ctx.orgId)
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'not_found' }
  revalidatePath('/settings/team')
  return { ok: true, token }
}

/**
 * Accept an invitation. Authenticated only. Hashes the plaintext token
 * server-side and delegates all verification to the SECURITY DEFINER RPC.
 */
export async function acceptInvitation(token: string): Promise<
  { ok: true; alreadyMember: boolean; organizationName: string } | { error: string; invitedEmail?: string }
> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'not_authenticated' }

  const { data, error } = await supabase.rpc('accept_invitation', { p_token_hash: hashToken(token) })
  if (error) return { error: error.message }

  const res = (data ?? {}) as Record<string, unknown>
  if (res.error) return { error: String(res.error), invitedEmail: res.invited_email as string | undefined }

  revalidatePath('/', 'layout')
  return {
    ok: true,
    alreadyMember: !!res.already_member,
    organizationName: String(res.organization_name ?? 'your organization'),
  }
}
