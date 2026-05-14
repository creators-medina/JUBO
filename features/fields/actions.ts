'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { FieldType } from '@/types/database'

export async function createField(data: {
  organization_id: string
  board_id: string
  name: string
  slug: string
  field_type: FieldType
  is_required?: boolean
  position?: number
  config?: Record<string, unknown>
}) {
  const supabase = await createClient()
  const { error } = await supabase.from('fields').insert({
    ...data,
    config: data.config ?? {},
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/boards/${data.board_id}`)
}

export async function getBoardFields(boardId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('fields')
    .select('*')
    .eq('board_id', boardId)
    .order('position', { ascending: true })
  return data ?? []
}
