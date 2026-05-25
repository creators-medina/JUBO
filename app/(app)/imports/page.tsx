import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getImports } from '@/features/imports/queries'
import { ImportHistoryClient } from '@/features/imports/components/ImportHistoryClient'

export const dynamic = 'force-dynamic'

export default async function ImportsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) redirect('/onboarding')

  const imports = await getImports(membership.organization_id)
  return <ImportHistoryClient imports={imports} />
}
