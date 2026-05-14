'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
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

  const { error } = await supabase.from('boards').insert({
    ...data,
    created_by: user.id,
  })

  if (error) throw new Error(error.message)
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
