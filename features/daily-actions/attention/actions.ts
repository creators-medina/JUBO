'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateSavedViewAttention(input: {
  saved_view_id: string
  is_attention_view: boolean
  attention_priority?: string | null
  attention_label?: string | null
  attention_color?: string | null
  show_on_today?: boolean
}): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_saved_view_attention', {
    p_saved_view_id:      input.saved_view_id,
    p_is_attention_view:  input.is_attention_view,
    p_attention_priority: input.attention_priority ?? null,
    p_attention_label:    input.attention_label ?? null,
    p_attention_color:    input.attention_color ?? null,
    p_show_on_today:      input.show_on_today ?? input.is_attention_view,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/today')
}

export async function deleteSavedView(savedViewId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('saved_views').delete().eq('id', savedViewId)
  if (error) throw new Error(error.message)
  revalidatePath('/today')
}
