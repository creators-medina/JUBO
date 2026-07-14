// ─────────────────────────────────────────────────────────────────────────
// Phase 39A — Prospecting schedule reads.
// Resolves the effective schedule for a user: their own row → org default → none.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { defaultSchedule, normalizeSchedule, type ProspectingSchedule } from './types'

export type ScheduleSource = 'user' | 'org_default' | 'none'

export async function getProspectingSchedule(
  organizationId: string,
  userId: string,
): Promise<{ schedule: ProspectingSchedule; source: ScheduleSource }> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('prospecting_schedules')
    .select('user_id, enabled, strict, week')
    .eq('organization_id', organizationId)
    .or(`user_id.eq.${userId},user_id.is.null`)

  const rows = data ?? []
  const own = rows.find((r) => r.user_id === userId)
  if (own) return { schedule: normalizeSchedule(own), source: 'user' }

  const orgDefault = rows.find((r) => r.user_id === null)
  if (orgDefault) return { schedule: normalizeSchedule(orgDefault), source: 'org_default' }

  return { schedule: defaultSchedule(), source: 'none' }
}
