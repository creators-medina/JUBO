import { createClient } from '@/lib/supabase/server'

export async function getRecordsByBoard(boardId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('records')
    .select('*')
    .eq('board_id', boardId)
    .eq('is_archived', false)
    .order('position', { ascending: true })
  return data ?? []
}

export async function getRecord(recordId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('records')
    .select('*')
    .eq('id', recordId)
    .single()
  return data
}

export async function getRecordFieldValues(recordId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('field_values')
    .select('*, fields(id, name, slug, field_type)')
    .eq('record_id', recordId)
  return data ?? []
}

export async function getRecordActivities(recordId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('activities')
    .select('*, profiles:user_id(first_name, last_name, email)')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
    .limit(50)
  return data ?? []
}

export async function getRecordMovements(recordId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('record_movements')
    .select('*, from_group:from_group_id(name), to_group:to_group_id(name)')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
  return data ?? []
}
