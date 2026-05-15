import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getFunnels, getProductionGoals, getConversionAssumptions, getFunnelStagesByIds,
} from '@/features/goals/queries'
import { getBoards } from '@/features/boards/queries'
import { GoalsPageClient } from '@/features/goals/components/GoalsPageClient'

export default async function GoalsPage() {
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

  const orgId = membership.organization_id

  const [funnels, goals, boards] = await Promise.all([
    getFunnels(orgId),
    getProductionGoals(orgId),
    getBoards(orgId),
  ])

  // Pull stages for every funnel + assumptions per org.
  // We also fetch board_groups for every board so the stage→group selector is populated.
  const stagesByFunnel: Record<string, Awaited<ReturnType<typeof getFunnelStagesByIds>>> = {}
  await Promise.all(funnels.map(async f => {
    const stagesQ = await supabase.from('funnel_stages').select('*').eq('funnel_id', f.id).order('stage_order')
    stagesByFunnel[f.id] = (stagesQ.data ?? []) as any
  }))

  const assumptions = await getConversionAssumptions(orgId)

  const boardGroupsByBoard: Record<string, Array<{ id: string; name: string; board_id: string }>> = {}
  await Promise.all(boards.map(async b => {
    const { data } = await supabase
      .from('board_groups')
      .select('id, name, board_id')
      .eq('board_id', b.id)
      .eq('is_archived', false)
      .order('position')
    boardGroupsByBoard[b.id] = (data ?? []) as any
  }))

  return (
    <GoalsPageClient
      organizationId={orgId}
      funnels={funnels}
      stagesByFunnel={stagesByFunnel}
      assumptions={assumptions}
      goals={goals}
      boards={boards.map(b => ({ id: b.id, name: b.name }))}
      boardGroupsByBoard={boardGroupsByBoard}
    />
  )
}
