'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createOrganization(name: string, slug: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Create org
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name, slug, owner_user_id: user.id })
    .select()
    .single()

  if (orgError) throw new Error(orgError.message)

  // Add user as owner member
  const { error: memberError } = await supabase
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'owner',
      joined_at: new Date().toISOString(),
    })

  if (memberError) throw new Error(memberError.message)

  revalidatePath('/dashboard')
  redirect('/dashboard')
}
