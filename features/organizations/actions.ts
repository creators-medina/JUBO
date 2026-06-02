'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOrgRole } from '@/features/auth/guards'

export async function createOrganization(name: string, slug: string) {
  const supabase = await createClient()

  const { data: orgId, error } = await supabase.rpc('create_organization_with_owner', {
    org_name: name,
    org_slug: slug,
  })

  if (error) throw new Error(error.message)
  if (!orgId) throw new Error('Failed to create organization')

  revalidatePath('/dashboard')
  // New orgs go straight into the guided setup wizard, which provisions the
  // starter workspace (boards/dashboards/goals/workflows) around their answers.
  redirect('/onboarding/setup')
}

export type UpdateOrgSettingsInput = {
  name?: string
  timezone?: string
  team_size?: number | null
  monthly_volume_goal?: number | null
  logo_url?: string | null
}

/**
 * Update organization settings. Owner/Admin only. The org is resolved
 * server-side from the caller's membership — the client never passes an
 * organization_id, so there is no way to edit another org's settings.
 */
export async function updateOrganizationSettings(
  input: UpdateOrgSettingsInput,
): Promise<{ ok: true } | { error: string }> {
  let ctx
  try {
    ctx = await requireOrgRole('admin')
  } catch (e) {
    return { error: e instanceof Error && e.message === 'Forbidden' ? 'forbidden' : 'unauthorized' }
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) {
    const name = input.name.trim()
    if (!name) return { error: 'name_required' }
    patch.name = name
  }
  if (input.timezone !== undefined) patch.timezone = input.timezone.trim() || 'America/New_York'
  if (input.team_size !== undefined) {
    patch.team_size = input.team_size == null || Number.isNaN(input.team_size) ? null : Math.max(0, Math.round(input.team_size))
  }
  if (input.monthly_volume_goal !== undefined) {
    patch.monthly_volume_goal = input.monthly_volume_goal == null || Number.isNaN(input.monthly_volume_goal) ? null : Math.max(0, input.monthly_volume_goal)
  }
  if (input.logo_url !== undefined) {
    const v = (input.logo_url ?? '').trim()
    patch.logo_url = v || null
  }

  if (Object.keys(patch).length === 0) return { ok: true }

  const { error } = await ctx.supabase
    .from('organizations')
    .update(patch)
    .eq('id', ctx.orgId)
  if (error) return { error: error.message }

  revalidatePath('/settings/organization')
  revalidatePath('/dashboard')
  return { ok: true }
}
