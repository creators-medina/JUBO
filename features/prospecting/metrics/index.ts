// ─────────────────────────────────────────────────────────────────────────
// Prospecting metrics — derived from communication_logs (calls) for a user.
// Server-side reads; org-scoped. No AI.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { isConnect, isBookedAppointment } from '@/features/communications/outcomes'
import type { ProspectingMetrics } from '../types'

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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
  const connects = (arr: LogLite[]) => calls(arr).filter((l) => isConnect(l.outcome)).length

  const callsToday = calls(today).length
  const connectsToday = connects(today)
  const voicemailToday = calls(today).filter((l) => l.outcome === 'voicemail').length
  const noAnswerToday = calls(today).filter((l) => l.outcome === 'no_answer').length
  const meetingsBookedToday = today.filter((l) => isBookedAppointment(l.channel, l.outcome)).length
  const followUpsCreatedToday = today.filter((l) => l.follow_up_at != null).length

  const callsThisWeek = calls(week).length
  const connectsThisWeek = connects(week)
  const bookedThisWeek = week.filter((l) => isBookedAppointment(l.channel, l.outcome)).length

  // Calls per day this week → active days + best day.
  const byDay = new Map<string, number>()
  for (const l of calls(week)) {
    const day = l.occurred_at.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + 1)
  }
  let bestDayCalls = 0
  let bestDayKey: string | null = null
  for (const [day, n] of byDay) {
    if (n > bestDayCalls) { bestDayCalls = n; bestDayKey = day }
  }
  const bestDayLabel = bestDayKey ? WEEKDAY[new Date(bestDayKey + 'T00:00:00').getDay()] : null

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
    callsThisWeek,
    connectsThisWeek,
    connectionRateWeek: callsThisWeek > 0 ? connectsThisWeek / callsThisWeek : 0,
    bookedThisWeek,
    activeDaysThisWeek: byDay.size,
    bestDayCalls,
    bestDayLabel,
    avgCallsPerActiveDay: Math.round(avgCallsPerActiveDay * 10) / 10,
  }
}
