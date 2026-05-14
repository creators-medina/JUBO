import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBoard, getBoardGroups } from '@/features/boards/queries'
import { getBoardFields } from '@/features/fields/actions'
import { getRecordsByBoard } from '@/features/records/queries'
import { BoardDetailClient } from '@/features/boards/components/BoardDetailClient'

export default async function BoardDetailPage({
  params,
}: {
  params: Promise<{ boardId: string }>
}) {
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

  // Fetch all field values for all records on this board in one query
  const recordIds = records.map((r: any) => r.id)
  const { data: fieldValues } = recordIds.length > 0
    ? await supabase.from('field_values').select('*').in('record_id', recordIds)
    : { data: [] }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BoardDetailClient
        board={board}
        groups={groups}
        fields={fields}
        records={records}
        fieldValues={fieldValues ?? []}
        organizationId={membership.organization_id}
      />
    </div>
  )
}
