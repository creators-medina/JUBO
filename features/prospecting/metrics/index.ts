// ─────────────────────────────────────────────────────────────────────────
// Prospecting metrics — derived from communication_logs (calls) for a user.
// Server-side reads; org-scoped. No AI.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import type { ProspectingMetrics } from '../types'

function startOfTodayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}
function startOfWeekISO(): string {
  const d = new Date(); const day = d.getDay(); const diff = (day + 6) % 7 // Monday start
  d.setDate(d.getDate() - diff); d.setHours(0, 0, 0, 0); return d.toISOString()
}

type LogLite = { channel: string; outcome: string | null; occurred_at: string; follow_up_at: string | null }

export async function getProspectingMetrics(organizationId: string, userId: string): Promise<ProspectingMetrics> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 14 * 86400000).toISOString()
  const { data } = await supabase
    .from('communication_logs')
    .select('channel, outcome, occurred_at, follow_up_at')
    .eq('organization_id', organizationId)
    .eq('created_by', userId)
    .gte('occurred_at', since)
    .order('occurred_at', { ascending: false })

  const logs = (data as LogLite[] | null) ?? []
  const todayStart = startOfTodayISO()
  const weekStart = startOfWeekISO()

  const today = logs.filter((l) => l.occurred_at >= todayStart)
  const week = logs.filter((l) => l.occurred_at >= weekStart)
  const calls = (arr: LogLite[]) => arr.filter((l) => l.channel === 'call')

  const callsToday = calls(today).length
  const connectsToday = calls(today).filter((l) => l.outcome === 'connected').length
  const voicemailToday = calls(today).filter((l) => l.outcome === 'voicemail').length
  const noAnswerToday = calls(today).filter((l) => l.outcome === 'no_answer').length
  const meetingsBookedToday = today.filter((l) => l.channel === 'meeting' || l.outcome === 'scheduled').length
  const followUpsCreatedToday = today.filter((l) => l.follow_up_at != null).length

  // Distinct active call days over the 14d window for an average.
  const callDays = new Set(calls(logs).map((l) => l.occurred_at.slice(0, 10)))
  const avgCallsPerActiveDay = callDays.size > 0 ? calls(logs).length / callDays.size : 0

  return {
    callsToday,
    connectsToday,
    voicemailToday,
    noAnswerToday,
    connectionRate: callsToday > 0 ? connectsToday / callsToday : 0,
    meetingsBookedToday,
    followUpsCreatedToday,
    callsThisWeek: calls(week).length,
    connectsThisWeek: calls(week).filter((l) => l.outcome === 'connected').length,
    avgCallsPerActiveDay: Math.round(avgCallsPerActiveDay * 10) / 10,
  }
}
