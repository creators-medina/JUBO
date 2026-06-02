// ─────────────────────────────────────────────────────────────────────────
// Server-side auth + org-permission guards.
//
// Centralizes the patterns that were previously copy-pasted across server
// actions (requireUser / requireUserOrg) and adds role-tiered checks that
// Phase 31B/31C/31D will reuse for team management.
//
// IMPORTANT: org context is always resolved SERVER-SIDE from the caller's
// membership — never trusted from a client-passed organization_id.
//
// This module is plain server-side utility code (NOT a 'use server' action
// file), so it can export pure helpers alongside async ones.
// ─────────────────────────────────────────────────────────────────────────

import type { User, SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { OrgRole } from '@/types/database'

// Role tiers — higher number = more privilege. owner ⊃ admin ⊃ manager ⊃ member.
const ROLE_RANK: Record<OrgRole, number> = {
  owner: 4,
  admin: 3,
  manager: 2,
  member: 1,
}

/** True when `role` meets or exceeds `min` in the privilege tier. */
export function orgRoleAtLeast(role: OrgRole | string | null | undefined, min: OrgRole): boolean {
  if (!role || !(role in ROLE_RANK)) return false
  return ROLE_RANK[role as OrgRole] >= ROLE_RANK[min]
}

/** True for owner or admin (the "can manage the workspace" tier). */
export function isOrgAdmin(role: OrgRole | string | null | undefined): boolean {
  return orgRoleAtLeast(role, 'admin')
}

/** True only for the org owner. */
export function isOrgOwner(role: OrgRole | string | null | undefined): boolean {
  return role === 'owner'
}

export type UserContext = { supabase: SupabaseClient; user: User }
export type OrgContext = UserContext & { orgId: string; role: OrgRole }

/** Require an authenticated user. Throws if not signed in. */
export async function requireUser(): Promise<UserContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

/**
 * Require an authenticated user with an organization membership. Resolves the
 * org + role server-side from organization_members (currently the first/only
 * membership — multi-org switching arrives in a later phase). Throws otherwise.
 */
export async function requireUserOrg(): Promise<OrgContext> {
  const { supabase, user } = await requireUser()
  const { data: m } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!m) throw new Error('No organization')
  const row = m as { organization_id: string; role: OrgRole }
  return { supabase, user, orgId: row.organization_id, role: row.role }
}

/**
 * Require that the caller's org role meets `min`. Returns the full org context
 * on success; throws 'Forbidden' otherwise. Use in mutating server actions.
 */
export async function requireOrgRole(min: OrgRole): Promise<OrgContext> {
  const ctx = await requireUserOrg()
  if (!orgRoleAtLeast(ctx.role, min)) throw new Error('Forbidden')
  return ctx
}
