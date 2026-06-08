// ─────────────────────────────────────────────────────────────────────────
// Phase 34B — Prospecting streak. Consecutive calendar days (local time) with
// at least one logged call, derived entirely from communication_logs. No new
// schema. Today not yet having a call does NOT break the streak — it stands on
// yesterday's count until the day is over (Duolingo-style "at risk").
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import type { ProspectingStreak } from '../types'

// How far back to look. A streak longer than this is capped (cosmetic only).
const LOOKBACK_DAYS = 180

/** YYYY-MM-DD in local time (matches how "today" is bucketed elsewhere). */
function dayKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function getProspectingStreak(organizationId: string, userId: string): Promise<ProspectingStreak> {
  const supabase = await createClient()
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString()
  const { data } = await supabase
    .from('communication_logs')
    .select('occurred_at')
    .eq('organization_id', organizationId)
    .eq('created_by', userId)
    .eq('channel', 'call')
    .gte('occurred_at', since)

  const days = new Set<string>()
  for (const row of (data as { occurred_at: string }[] | null) ?? []) {
    days.add(dayKey(new Date(row.occurred_at)))
  }

  const todayLogged = days.has(dayKey(new Date()))

  // Walk backwards from today. If today has no call yet, start from yesterday
  // so the streak isn't shown broken before the day ends.
  const cursor = new Date()
  cursor.setHours(0, 0, 0, 0)
  if (!todayLogged) cursor.setDate(cursor.getDate() - 1)

  let current = 0
  while (days.has(dayKey(cursor))) {
    current++
    cursor.setDate(cursor.getDate() - 1)
  }

  return { current, todayLogged }
}
