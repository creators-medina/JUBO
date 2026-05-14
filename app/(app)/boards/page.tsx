import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBoards } from '@/features/boards/queries'
import { ContentContainer } from '@/components/primitives/ContentContainer'
import { BoardsClient } from '@/features/boards/components/BoardsClient'

export default async function BoardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!memberships) redirect('/onboarding')

  const boards = await getBoards(memberships.organization_id)

  return (
    <ContentContainer>
      <BoardsClient boards={boards} organizationId={memberships.organization_id} />
    </ContentContainer>
  )
}
