import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BlueprintBuilder } from '@/features/blueprints/components/BlueprintBuilder'

export const dynamic = 'force-dynamic'

export default async function BlueprintsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).single()
  if (!membership) redirect('/onboarding')

  return <BlueprintBuilder />
}
