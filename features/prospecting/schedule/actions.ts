'use server'

// ─────────────────────────────────────────────────────────────────────────
// Phase 39A — Prospecting schedule writes. A user saves only their own row;
// normalization guarantees the JSONB is well-formed regardless of client input.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { normalizeSchedule, type ProspectingSchedule } from './types'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

export async function saveProspectingSchedule(
  organizationId: string,
  input: ProspectingSchedule,
): Promise<{ ok: true } | { error: string }> {
  const { supabase, user } = await requireUser()
  const clean = normalizeSchedule(input)

  const { error } = await supabase
    .from('prospecting_schedules')
    .upsert(
      {
        organization_id: organizationId,
        user_id: user.id,
        enabled: clean.enabled,
        strict: clean.strict,
        week: clean.week,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,user_id' },
    )

  if (error) return { error: error.message }
  revalidatePath('/prospecting')
  revalidatePath('/prospecting/settings')
  return { ok: true }
}
