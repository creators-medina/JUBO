// ─────────────────────────────────────────────────────────────────────────
// Phase 34B.1 — "Contacted Today" feed. The calls/contacts an LO has already
// logged today, so completed work is visible and rewarding. Reads existing
// communication_logs (joined to records for the name). No schema changes.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import type { ContactedTodayItem } from '../types'

function startOfTodayISO(): string {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString()
}

export async function getContactedToday(
  organizationId: string,
  userId: string,
  limit = 50,
): Promise<ContactedTodayItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('communication_logs')
    .select('record_id, channel, outcome, occurred_at, records(title)')
    .eq('organization_id', organizationId)
    .eq('created_by', userId)
    .neq('channel', 'internal')
    .gte('occurred_at', startOfTodayISO())
    .order('occurred_at', { ascending: false })
    .limit(limit)

  return ((data as unknown as Array<{
    record_id: string; channel: string; outcome: string | null; occurred_at: string
    records: { title: string | null } | null
  }>) ?? []).map((r) => ({
    recordId: r.record_id,
    title: r.records?.title ?? 'Untitled',
    channel: r.channel,
    outcome: r.outcome,
    occurredAt: r.occurred_at,
  }))
}
