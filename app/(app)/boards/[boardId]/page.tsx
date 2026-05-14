import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBoard, getBoardGroups } from '@/features/boards/queries'
import { getBoardFields } from '@/features/fields/actions'
import { getRecordsByBoard } from '@/features/records/queries'
import { ContentContainer } from '@/components/primitives/ContentContainer'
import { BoardDetailClient } from '@/features/boards/components/BoardDetailClient'

export default async function BoardDetailPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/onboarding')

  const [board, groups, fields, records] = await Promise.all([
    getBoard(boardId),
    getBoardGroups(boardId),
    getBoardFields(boardId),
    getRecordsByBoard(boardId),
  ])

  if (!board) notFound()

  return (
    <ContentContainer maxWidth="full" className="p-4">
      <BoardDetailClient
        board={board}
        groups={groups}
        fields={fields}
        records={records}
        organizationId={membership.organization_id}
      />
    </ContentContainer>
  )
}
