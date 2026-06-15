'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { defaultStatusOptions } from '@/features/fields/status'
import type { BoardType } from '@/types/database'

export async function createBoard(data: {
  organization_id: string
  name: string
  slug: string
  description?: string
  board_type: BoardType
  color?: string
  icon?: string
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: board, error } = await supabase.from('boards').insert({
    ...data,
    created_by: user.id,
  }).select('id').single()

  if (error || !board) throw new Error(error?.message ?? 'Could not create board')

  // Seed a default group so records have a home.
  await supabase.from('board_groups').insert({ board_id: board.id, name: 'New', position: 0 })

  // New CRM boards get a real Monday-style Status field instead of relying on
  // the (now-hidden) internal records.status column. (Phase 34A.1)
  if (data.board_type === 'crm') {
    await supabase.from('fields').insert({
      organization_id: data.organization_id,
      board_id: board.id,
      name: 'Status',
      slug: 'status',
      field_type: 'status',
      config: { options: defaultStatusOptions() },
      position: 0,
    })
  }

  revalidatePath('/boards')
}

export async function createBoardGroup(data: {
  board_id: string
  name: string
  color?: string
  position: number
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('board_groups').insert(data)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${data.board_id}`)
}

export async function updateBoard(boardId: string, updates: {
  name?: string
  description?: string
  color?: string
  icon?: string
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('boards').update(updates).eq('id', boardId)
  if (error) throw new Error(error.message)
  revalidatePath('/boards')
  revalidatePath(`/boards/${boardId}`)
}

export async function updateBoardGroup(groupId: string, boardId: string, updates: {
  name?: string
  color?: string
  position?: number
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('board_groups').update(updates).eq('id', groupId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

export async function deleteBoardGroup(groupId: string, boardId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('board_groups').update({ is_archived: true }).eq('id', groupId)
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${boardId}`)
}

export async function createSavedView(data: {
  organization_id: string
  board_id: string
  name: string
  filters: unknown
  sort?: unknown
  visible_fields?: unknown
}): Promise<string> {
  const supabase = await createClient()
  const { data: viewId, error } = await supabase.rpc('create_saved_view', {
    p_organization_id: data.organization_id,
    p_board_id:        data.board_id,
    p_name:            data.name,
    p_filters:         data.filters,
    p_sort:            data.sort ?? null,
    p_visible_fields:  data.visible_fields ?? null,
  })
  if (error) throw new Error(error.message)
  if (!viewId) throw new Error('Failed to create saved view')
  return viewId as string
}
