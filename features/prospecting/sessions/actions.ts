'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getActiveSession, getLiveSessionStats } from './queries'
import { DEFAULT_DAILY_CALL_GOAL } from '../types'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

/** Snapshot live stats into a session row + close it. */
async function closeSession(sessionId: string) {
  const supabase = await createClient()
  const { data: session } = await supabase.from('prospecting_sessions').select('*').eq('id', sessionId).maybeSingle()
  if (!session) return
  const stats = await getLiveSessionStats(session as never)
  await supabase
    .from('prospecting_sessions')
    .update({
      ended_at: new Date().toISOString(),
      attempted_calls: stats.attempted, connected_calls: stats.connected,
      voicemail_count: stats.voicemail, no_answer_count: stats.noAnswer, meetings_booked: stats.meetings,
    })
    .eq('id', sessionId)
}

/** Start a session (closing any open one first). */
export async function startProspectingSession(organizationId: string, targetCalls = DEFAULT_DAILY_CALL_GOAL): Promise<{ id: string }> {
  const { supabase, user } = await requireUser()

  const open = await getActiveSession(organizationId, user.id)
  if (open) await closeSession(open.id)

  const { data, error } = await supabase
    .from('prospecting_sessions')
    .insert({ organization_id: organizationId, user_id: user.id, target_calls: targetCalls })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not start session')
  revalidatePath('/prospecting')
  revalidatePath('/dashboard')
  return { id: data.id }
}

export async function endProspectingSession(sessionId: string): Promise<void> {
  await requireUser()
  await closeSession(sessionId)
  revalidatePath('/prospecting')
  revalidatePath('/dashboard')
}

/** End the caller's currently-open session (if any) — used from the palette. */
export async function endActiveProspectingSession(organizationId: string): Promise<void> {
  const { user } = await requireUser()
  const open = await getActiveSession(organizationId, user.id)
  if (open) await closeSession(open.id)
  revalidatePath('/prospecting')
  revalidatePath('/dashboard')
}
