// ─────────────────────────────────────────────────────────────────────────
// Communication metrics — pure functions over a record's communication logs.
// Used by the workspace header, opportunity signals, and Today coaching.
// ─────────────────────────────────────────────────────────────────────────

import type { CommunicationLog, ContactHealth } from '../types'

/** Most recent NON-internal communication timestamp, or null. */
export function getLastContactedAt(logs: CommunicationLog[]): string | null {
  const external = logs.filter((l) => l.channel !== 'internal')
  if (external.length === 0) return null
  return external.reduce((max, l) => (l.occurred_at > max ? l.occurred_at : max), external[0].occurred_at)
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((Date.now() - t) / 86400000)
}

export function getContactHealth(logs: CommunicationLog[]): ContactHealth {
  const d = daysSince(getLastContactedAt(logs))
  if (d == null) return 'unknown'
  if (d <= 7) return 'healthy'
  if (d <= 14) return 'warming'
  return 'stale'
}

export function getCommunicationCounts(logs: CommunicationLog[]): {
  total: number
  byChannel: Record<string, number>
  connected: number
  noAnswerStreak: number
} {
  const byChannel: Record<string, number> = {}
  let connected = 0
  for (const l of logs) {
    byChannel[l.channel] = (byChannel[l.channel] ?? 0) + 1
    if (l.outcome === 'connected') connected++
  }
  // Consecutive no-answer/voicemail call attempts from the most recent backward.
  const calls = logs.filter((l) => l.channel === 'call').sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))
  let noAnswerStreak = 0
  for (const c of calls) {
    if (c.outcome === 'no_answer' || c.outcome === 'voicemail') noAnswerStreak++
    else break
  }
  return { total: logs.length, byChannel, connected, noAnswerStreak }
}

/** Has a follow-up been promised but no next action / future follow-up scheduled? */
export function hasOpenFollowUp(logs: CommunicationLog[]): boolean {
  return logs.some((l) => l.follow_up_at != null && new Date(l.follow_up_at).getTime() >= Date.now() - 86400000)
}

export function getRecentCommunicationSummary(logs: CommunicationLog[]): string | null {
  const last = [...logs].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at))[0]
  if (!last) return null
  return last.summary ?? last.subject ?? null
}
