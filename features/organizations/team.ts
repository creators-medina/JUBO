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
