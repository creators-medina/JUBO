import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBoard, getBoardGroups } from '@/features/boards/queries'
import { getGroupVisibleFields } from '@/features/fields/actions'
import { getRecordsByBoard } from '@/features/records/queries'
import { getNotesSummaryForRecords } from '@/features/workspace/notes/queries'
import { isNotesField } from '@/features/boards/notes'
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

  const [board, groups, fieldData, records] = await Promise.all([
    getBoard(boardId),
    getBoardGroups(boardId),
    getGroupVisibleFields(boardId),
    getRecordsByBoard(boardId),
  ])

  if (!board) notFound()

  const { fields, visibility } = fieldData

  // Fetch all field values for all records on this board in one query
  const recordIds = records.map((r: any) => r.id)
  const { data: fieldValues } = recordIds.length > 0
    ? await supabase.from('field_values').select('*').in('record_id', recordIds)
    : { data: [] }

  // Notes column (Phase 35A): only summarize when the board actually has one.
  const hasNotesColumn = (fields as any[]).some((f) => isNotesField(f))
  const notesByRecord = hasNotesColumn ? await getNotesSummaryForRecords(recordIds) : undefined

  // "This week" outreach progress (header redesign) — READ-ONLY: distinct
  // records on this board with a non-internal communication logged since
  // Monday. Powers the week ring + per-stage progress; failure degrades to
  // hiding the card, never blocking the board.
  const weekStart = new Date()
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7))
  weekStart.setHours(0, 0, 0, 0)
  const { data: weekLogs } = await supabase
    .from('communication_logs')
    .select('record_id')
    .eq('organization_id', membership.organization_id)
    .neq('channel', 'internal')
    .gte('occurred_at', weekStart.toISOString())
    .limit(5000)
  const contactedIds = new Set((weekLogs ?? []).map((l: { record_id: string | null }) => l.record_id).filter(Boolean))
  const contactedByGroup: Record<string, number> = {}
  let contactedTotal = 0
  for (const r of records as { id: string; group_id: string | null; parent_record_id?: string | null }[]) {
    if (r.parent_record_id || !contactedIds.has(r.id)) continue
    contactedTotal += 1
    if (r.group_id) contactedByGroup[r.group_id] = (contactedByGroup[r.group_id] ?? 0) + 1
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <BoardDetailClient
        board={board}
        groups={groups}
        fields={fields}
        fieldVisibility={visibility}
        records={records}
        fieldValues={fieldValues ?? []}
        organizationId={membership.organization_id}
        notesByRecord={notesByRecord}
        contactedThisWeek={{ total: contactedTotal, byGroup: contactedByGroup }}
      />
    </div>
  )
}
