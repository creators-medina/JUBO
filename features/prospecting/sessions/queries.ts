import { createClient } from '@/lib/supabase/server'
import type { LiveSessionStats, SessionRow } from '../types'

export async function getActiveSession(organizationId: string, userId: string): Promise<SessionRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('prospecting_sessions')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as SessionRow | null) ?? null
}

/** Live stats for a session, computed from the user's call logs since it started. */
export async function getLiveSessionStats(session: SessionRow): Promise<LiveSessionStats> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('communication_logs')
    .select('channel, outcome')
    .eq('organization_id', session.organization_id)
    .eq('created_by', session.user_id)
    .gte('occurred_at', session.started_at)

  const logs = (data ?? []) as { channel: string; outcome: string | null }[]
  const calls = logs.filter((l) => l.channel === 'call')
  return {
    attempted: calls.length,
    connected: calls.filter((l) => l.outcome === 'connected').length,
    voicemail: calls.filter((l) => l.outcome === 'voicemail').length,
    noAnswer: calls.filter((l) => l.outcome === 'no_answer').length,
    meetings: logs.filter((l) => l.channel === 'meeting' || l.outcome === 'scheduled').length,
  }
}
