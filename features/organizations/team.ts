'use server'

import { revalidatePath } from 'next/cache'
import { requireOrgRole } from '@/features/auth/guards'
import type { OrgRole } from '@/types/database'

// 'owner' is intentionally excluded — promoting someone to owner is an
// ownership transfer, which arrives in a later phase.
const ASSIGNABLE_ROLES: OrgRole[] = ['admin', 'manager', 'member']

type ActionResult = { ok: true } | { error: string }

type TargetMember = { id: string; user_id: string; role: OrgRole; status: string }

/**
 * Shared preamble for every member mutation: require admin-tier, load the
 * target membership scoped to the caller's org, and expose owner-count + a
 * convenience flag for "is this the caller themselves".
 */
async function loadTarget(membershipId: string) {
  const ctx = await requireOrgRole('admin') // throws 'Forbidden' for member/manager
  const { data, error } = await ctx.supabase
    .from('organization_members')
    .select('id, user_id, role, status')
    .eq('id', membershipId)
    .eq('organization_id', ctx.orgId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const target = data as TargetMember | null
  if (!target) throw new Error('not_found')

  // Count remaining ACTIVE owners — the last-owner guard relies on this.
  const { count: activeOwnerCount } = await ctx.supabase
    .from('organization_members')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.orgId)
    .eq('role', 'owner')
    .eq('status', 'active')

  return { ctx, target, activeOwnerCount: activeOwnerCount ?? 0 }
}

function wrap(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  return fn().catch((e: unknown): ActionResult => {
    const msg = e instanceof Error ? e.message : 'unknown'
    if (msg === 'Forbidden') return { error: 'forbidden' }
    if (msg === 'Not authenticated' || msg === 'No organization') return { error: 'unauthorized' }
    if (msg === 'not_found') return { error: 'not_found' }
    return { error: msg }
  })
}

function done(): ActionResult {
  revalidatePath('/settings/team')
  return { ok: true }
}

/** Change a member's role. Owner/Admin only. */
export async function changeMemberRole(membershipId: string, newRole: string): Promise<ActionResult> {
  return wrap(async () => {
    const { ctx, target } = await loadTarget(membershipId)

    if (newRole === 'owner') return { error: 'transfer_not_available' }
    if (!ASSIGNABLE_ROLES.includes(newRole as OrgRole)) return { error: 'invalid_role' }
    if (target.role === newRole) return done()

    // Touching an owner: only the owner may, and never demote the last owner.
    if (target.role === 'owner') {
      if (ctx.role !== 'owner') return { error: 'admin_cannot_demote_owner' }
      // Demoting an owner away from 'owner' — block if they're the last owner.
      const { count } = await ctx.supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.orgId)
        .eq('role', 'owner')
        .eq('status', 'active')
      if ((count ?? 0) <= 1) return { error: 'last_owner' }
    }

    const { error } = await ctx.supabase
      .from('organization_members')
      .update({ role: newRole })
      .eq('id', membershipId)
      .eq('organization_id', ctx.orgId)
    if (error) return { error: error.message }
    return done()
  })
}

/** Enable or disable a member's access. Owner/Admin only. */
export async function setMemberStatus(membershipId: string, status: 'active' | 'disabled'): Promise<ActionResult> {
  return wrap(async () => {
    const { ctx, target, activeOwnerCount } = await loadTarget(membershipId)

    if (status !== 'active' && status !== 'disabled') return { error: 'invalid_status' }
    if (target.status === status) return done()

    if (status === 'disabled') {
      if (target.user_id === ctx.user.id) return { error: 'cannot_disable_self' }
      if (target.role === 'owner') {
        if (ctx.role !== 'owner') return { error: 'admin_cannot_disable_owner' }
        if (activeOwnerCount <= 1) return { error: 'last_owner' }
      }
    }

    const { error } = await ctx.supabase
      .from('organization_members')
      .update({ status })
      .eq('id', membershipId)
      .eq('organization_id', ctx.orgId)
    if (error) return { error: error.message }
    return done()
  })
}

/** Remove a member from the org (deletes the membership, not the account). Owner/Admin only. */
export async function removeMember(membershipId: string): Promise<ActionResult> {
  return wrap(async () => {
    const { ctx, target, activeOwnerCount } = await loadTarget(membershipId)

    if (target.user_id === ctx.user.id) return { error: 'cannot_remove_self' }
    if (target.role === 'owner') {
      if (ctx.role !== 'owner') return { error: 'admin_cannot_remove_owner' }
      if (activeOwnerCount <= 1) return { error: 'last_owner' }
    }

    const { error } = await ctx.supabase
      .from('organization_members')
      .delete()
      .eq('id', membershipId)
      .eq('organization_id', ctx.orgId)
    if (error) return { error: error.message }
    return done()
  })
}

// ── Phase 33A — Producer / Support classification ─────────────────────────────

/**
 * Set a member's type (producer | support). Owner/Admin only. When the type
 * flips, any now-contradictory support links are cleaned up:
 *   • becoming 'producer' → drop links where they were the support side
 *   • becoming 'support'  → drop links where they were the producer side
 */
export async function setMemberType(membershipId: string, memberType: 'producer' | 'support'): Promise<ActionResult> {
  return wrap(async () => {
    if (memberType !== 'producer' && memberType !== 'support') return { error: 'invalid_member_type' }
    const { ctx, target } = await loadTarget(membershipId)

    const { error } = await ctx.supabase
      .from('organization_members')
      .update({ member_type: memberType })
      .eq('id', membershipId)
      .eq('organization_id', ctx.orgId)
    if (error) return { error: error.message }

    // Clean up links that no longer make sense for the new type.
    if (memberType === 'producer') {
      await ctx.supabase.from('producer_support_links')
        .delete().eq('organization_id', ctx.orgId).eq('support_user_id', target.user_id)
    } else {
      await ctx.supabase.from('producer_support_links')
        .delete().eq('organization_id', ctx.orgId).eq('producer_user_id', target.user_id)
    }
    return done()
  })
}

/** Verify a user is an active member of the caller's org with the expected type. */
async function memberTypeOf(
  ctx: Awaited<ReturnType<typeof requireOrgRole>>,
  userId: string,
): Promise<string | null> {
  const { data } = await ctx.supabase
    .from('organization_members')
    .select('member_type')
    .eq('organization_id', ctx.orgId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as { member_type: string } | null)?.member_type ?? null
}

/** Link a support user to a producer. Owner/Admin only. Both must be in the org with the right types. */
export async function assignSupportToProducer(supportUserId: string, producerUserId: string): Promise<ActionResult> {
  return wrap(async () => {
    const ctx = await requireOrgRole('admin')
    if (supportUserId === producerUserId) return { error: 'same_user' }

    const [supportType, producerType] = await Promise.all([
      memberTypeOf(ctx, supportUserId),
      memberTypeOf(ctx, producerUserId),
    ])
    if (supportType === null || producerType === null) return { error: 'not_in_org' }
    if (supportType !== 'support') return { error: 'not_a_support_user' }
    if (producerType !== 'producer') return { error: 'not_a_producer' }

    const { error } = await ctx.supabase.from('producer_support_links').insert({
      organization_id: ctx.orgId,
      producer_user_id: producerUserId,
      support_user_id: supportUserId,
    })
    if (error) return { error: error.code === '23505' ? 'already_linked' : error.message }
    revalidatePath('/settings/team')
    return { ok: true }
  })
}

/** Remove a support→producer link by id. Owner/Admin only. */
export async function unassignSupport(linkId: string): Promise<ActionResult> {
  return wrap(async () => {
    const ctx = await requireOrgRole('admin')
    const { error } = await ctx.supabase
      .from('producer_support_links')
      .delete()
      .eq('id', linkId)
      .eq('organization_id', ctx.orgId)
    if (error) return { error: error.message }
    revalidatePath('/settings/team')
    return { ok: true }
  })
}
