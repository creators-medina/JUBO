'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireOrgRole } from '@/features/auth/guards'
import { sendEmail, isEmailConfigured } from '@/lib/email/provider'
import { buildInviteEmail } from '@/lib/email/inviteEmail'
import { generateToken, hashToken } from './inviteToken'
import type { OrgRole } from '@/types/database'

const INVITABLE_ROLES: OrgRole[] = ['admin', 'manager', 'member']
const EXPIRY_DAYS = 7

// `emailSent` tells the UI whether the invite went out by email (true) or is
// link-only fallback (false) — the invite + token are returned either way.
export type InviteResult = { ok: true; token: string; emailSent: boolean } | { error: string }
export type SimpleResult = { ok: true } | { error: string }

function expiresAt(): string {
  return new Date(Date.now() + EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

/** Server-side origin for building accept links in emails (no `window`). */
function siteBaseUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  return base ? base.replace(/\/$/, '') : null
}

function buildAcceptUrl(token: string): string | null {
  const base = siteBaseUrl()
  return base ? `${base}/invite/accept?token=${encodeURIComponent(token)}` : null
}

/**
 * Best-effort invite email. Returns true only if the email actually sent.
 * Never throws — the invite is already created; email is a bonus over the
 * copy-link fallback. Requires a configured provider AND a server base URL.
 */
async function trySendInviteEmail(
  supabase: SupabaseClient,
  opts: { email: string; role: string; token: string; orgId: string; inviterUserId: string },
): Promise<boolean> {
  if (!isEmailConfigured()) return false
  const acceptUrl = buildAcceptUrl(opts.token)
  if (!acceptUrl) return false
  try {
    const [{ data: org }, { data: prof }] = await Promise.all([
      supabase.from('organizations').select('name').eq('id', opts.orgId).maybeSingle(),
      supabase.from('profiles').select('first_name, last_name').eq('id', opts.inviterUserId).maybeSingle(),
    ])
    const inviterName = [prof?.first_name, prof?.last_name].filter(Boolean).join(' ').trim() || null
    const { subject, html, text } = buildInviteEmail({
      orgName: (org as { name?: string } | null)?.name ?? 'your Jubo workspace',
      inviterName,
      role: opts.role,
      acceptUrl,
      invitedEmail: opts.email,
      expiresInDays: EXPIRY_DAYS,
    })
    const res = await sendEmail({ to: opts.email, subject, html, text })
    return res.sent
  } catch {
    return false
  }
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

  // Seat check — inert unless a seat_limit is configured (NULL = unlimited). We
  // count active members + still-pending invites so seats aren't over-committed.
  // The DB-side accept_invitation() check is the hard backstop; this is the
  // friendly early block at invite time. Never affects existing members.
  const { data: orgSeat } = await ctx.supabase.from('organizations').select('seat_limit').eq('id', ctx.orgId).maybeSingle()
  const seatLimit = (orgSeat as { seat_limit: number | null } | null)?.seat_limit ?? null
  if (seatLimit != null) {
    const [{ count: memberCount }, { count: pendingCount }] = await Promise.all([
      ctx.supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).eq('status', 'active'),
      ctx.supabase.from('organization_invitations').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.orgId).eq('status', 'pending'),
    ])
    if ((memberCount ?? 0) + (pendingCount ?? 0) >= seatLimit) return { error: 'seat_limit_reached' }
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

  // Invite is created regardless; email is best-effort over the copy-link fallback.
  const emailSent = await trySendInviteEmail(ctx.supabase, { email, role, token, orgId: ctx.orgId, inviterUserId: ctx.user.id })

  revalidatePath('/settings/team')
  return { ok: true, token, emailSent }
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
    .select('id, email, role')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'not_found' }

  const row = data as { id: string; email: string; role: string }
  const emailSent = await trySendInviteEmail(ctx.supabase, { email: row.email, role: row.role, token, orgId: ctx.orgId, inviterUserId: ctx.user.id })

  revalidatePath('/settings/team')
  return { ok: true, token, emailSent }
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
