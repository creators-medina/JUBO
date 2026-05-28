// ─────────────────────────────────────────────────────────────────────────
// Prospecting coaching — heuristic, motivating reads from the day's numbers.
// No AI. Reused on the cockpit and fed into Today.
// ─────────────────────────────────────────────────────────────────────────

import type { ProspectingMetrics } from '../types'
import type { ThemeDay } from './themeDay'

export type CoachTone = 'good' | 'warn' | 'urgent' | 'info'
export type CoachLine = { text: string; tone: CoachTone; icon: string }

export function buildProspectingCoaching(input: {
  metrics: ProspectingMetrics
  callGoal: number
  themeDay: ThemeDay
  queueSize: number
  followUpsDue?: number
}): CoachLine[] {
  const { metrics, callGoal, themeDay, queueSize, followUpsDue = 0 } = input
  const lines: CoachLine[] = []

  // Pace vs daily call goal.
  const remaining = Math.max(0, callGoal - metrics.callsToday)
  if (metrics.callsToday === 0) {
    lines.push({ tone: 'info', icon: 'Rocket', text: `${themeDay.label}: ${themeDay.blurb}` })
  } else if (remaining > 0) {
    lines.push({ tone: 'warn', icon: 'Target', text: `${remaining} more call${remaining === 1 ? '' : 's'} to hit today's goal of ${callGoal}.` })
  } else {
    lines.push({ tone: 'good', icon: 'Flame', text: `Goal hit — ${metrics.callsToday} calls today. Keep rolling.` })
  }

  // Connection rate read.
  if (metrics.callsToday >= 5) {
    const pct = Math.round(metrics.connectionRate * 100)
    lines.push({
      tone: pct >= 30 ? 'good' : 'info', icon: 'PhoneCall',
      text: `${pct}% connection rate today (${metrics.connectsToday}/${metrics.callsToday}).`,
    })
  }

  // Appointments.
  if (metrics.meetingsBookedToday > 0) {
    lines.push({ tone: 'good', icon: 'CalendarCheck', text: `${metrics.meetingsBookedToday} appointment${metrics.meetingsBookedToday === 1 ? '' : 's'} booked today.` })
  }

  // Follow-ups due.
  if (followUpsDue > 0) {
    lines.push({ tone: 'warn', icon: 'CalendarClock', text: `${followUpsDue} follow-up${followUpsDue === 1 ? '' : 's'} due — clear them today.` })
  }

  // Queue read.
  if (queueSize > 0 && remaining > 0) {
    lines.push({ tone: 'info', icon: 'ListChecks', text: `${queueSize} prioritized lead${queueSize === 1 ? '' : 's'} ready in your queue.` })
  }

  return lines.slice(0, 4)
}
