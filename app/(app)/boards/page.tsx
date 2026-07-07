import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBoards } from '@/features/boards/queries'
import { pickLoanAmountFieldId, loanAmountForSum } from '@/features/fields/loanAmount'
import { ContentContainer } from '@/components/primitives/ContentContainer'
import { BoardsClient, type BoardStats } from '@/features/boards/components/BoardsClient'

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
  const orgId = memberships.organization_id

  const boards = await getBoards(orgId)

  // READ-ONLY per-board rollups for the command-center cards: record counts,
  // last activity, and pipeline totals resolved through the shared loan-amount
  // resolver (loan_amount FIELD value first, legacy records.value fallback) —
  // the same source of truth the board header and sidebar use. Any failure
  // degrades to empty stats; the page still renders the boards.
  const stats: Record<string, BoardStats> = {}
  try {
    const [recsRes, fieldsRes] = await Promise.all([
      supabase
        .from('records')
        .select('id, board_id, value, parent_record_id, updated_at')
        .eq('organization_id', orgId)
        .eq('is_archived', false),
      supabase
        .from('fields')
        .select('id, board_id, slug, name, field_type, common_field_key_id, is_default_status')
        .eq('organization_id', orgId)
        .eq('field_type', 'currency'),
    ])
    const recs = recsRes.data ?? []

    // Pick each board's loan-amount field, then read only those fields' values.
    const fieldsByBoard = new Map<string, NonNullable<typeof fieldsRes.data>>()
    for (const f of fieldsRes.data ?? []) {
      const arr = fieldsByBoard.get(f.board_id as string) ?? []
      arr.push(f)
      fieldsByBoard.set(f.board_id as string, arr)
    }
    const loanFieldIds: string[] = []
    for (const arr of fieldsByBoard.values()) {
      const id = pickLoanAmountFieldId(arr)
      if (id) loanFieldIds.push(id)
    }
    const loanByRecord = new Map<string, number>()
    if (loanFieldIds.length > 0) {
      const { data: fvRows } = await supabase
        .from('field_values')
        .select('record_id, value_number')
        .in('field_id', loanFieldIds)
      for (const fv of fvRows ?? []) {
        if (typeof fv.value_number === 'number') loanByRecord.set(fv.record_id as string, fv.value_number)
      }
    }

    for (const r of recs as { id: string; board_id: string | null; value: number | string | null; parent_record_id: string | null; updated_at: string | null }[]) {
      if (!r.board_id || r.parent_record_id) continue
      const s = stats[r.board_id] ?? { count: 0, value: 0, lastUpdated: null }
      s.count += 1
      s.value += loanAmountForSum(loanByRecord.get(r.id), r.value)
      if (r.updated_at && (!s.lastUpdated || r.updated_at > s.lastUpdated)) s.lastUpdated = r.updated_at
      stats[r.board_id] = s
    }
  } catch { /* stats stay empty — boards render without rollups */ }

  return (
    <ContentContainer>
      <BoardsClient boards={boards} organizationId={memberships.organization_id} stats={stats} />
    </ContentContainer>
  )
}
