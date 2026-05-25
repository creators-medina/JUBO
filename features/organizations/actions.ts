'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

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
