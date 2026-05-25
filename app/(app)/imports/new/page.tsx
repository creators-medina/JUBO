import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listImportBoards } from '@/features/imports/actions'
import { ImportWizard } from '@/features/imports/components/ImportWizard'

export const dynamic = 'force-dynamic'

export default async function NewImportPage({
  searchParams,
}: {
  searchParams: Promise<{ template?: string }>
}) {
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

  const boards = await listImportBoards(membership.organization_id)
  const { template } = await searchParams

  return (
    <div className="h-full overflow-hidden">
      <ImportWizard organizationId={membership.organization_id} boards={boards} templateKey={template} />
    </div>
  )
}
