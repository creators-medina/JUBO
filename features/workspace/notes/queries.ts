import { createClient } from '@/lib/supabase/server'
import type { NoteRow } from '../types'

export async function getNotesForRecord(recordId: string): Promise<NoteRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('notes')
    .select('*')
    .eq('record_id', recordId)
    .order('created_at', { ascending: false })
  return (data ?? []) as NoteRow[]
}
