import { createClient } from '@/lib/supabase/server'

export async function getBoards(organizationId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('boards')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_archived', false)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getBoard(boardId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('boards')
    .select('*')
    .eq('id', boardId)
    .single()
  return data
}

export async function getBoardGroups(boardId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('board_groups')
    .select('*')
    .eq('board_id', boardId)
    .eq('is_archived', false)
    .order('position', { ascending: true })
  return data ?? []
}
