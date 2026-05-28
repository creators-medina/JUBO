import { createClient } from '@/lib/supabase/server'
import type { CommunicationLog } from './types'

export async function getCommunicationsForRecord(recordId: string): Promise<CommunicationLog[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('communication_logs')
    .select('*')
    .eq('record_id', recordId)
    .order('occurred_at', { ascending: false })
  return (data as CommunicationLog[] | null) ?? []
}

/** Count of follow-ups due (today or overdue, within a recent window) for an org. */
export async function getFollowUpsDueCount(organizationId: string): Promise<number> {
  const supabase = await createClient()
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const windowStart = new Date(Date.now() - 21 * 86400000)
  const { count } = await supabase
    .from('communication_logs')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('resolved_at', null)
    .gte('follow_up_at', windowStart.toISOString())
    .lte('follow_up_at', endOfToday.toISOString())
  return count ?? 0
}

export type FollowUpDueItem = {
  id: string
  recordId: string
  recordTitle: string | null
  boardId: string | null
  outcome: string | null
  channel: string
  followUpAt: string
  overdue: boolean
}

/** Open follow-ups due today/overdue, newest-due first, with record context. */
export async function getFollowUpsDue(organizationId: string, limit = 8): Promise<FollowUpDueItem[]> {
  const supabase = await createClient()
  const endOfToday = new Date()
  endOfToday.setHours(23, 59, 59, 999)
  const windowStart = new Date(Date.now() - 21 * 86400000)
  const { data } = await supabase
    .from('communication_logs')
    .select('id, record_id, channel, outcome, follow_up_at, records(title, board_id)')
    .eq('organization_id', organizationId)
    .is('resolved_at', null)
    .gte('follow_up_at', windowStart.toISOString())
    .lte('follow_up_at', endOfToday.toISOString())
    .order('follow_up_at', { ascending: true })
    .limit(limit)

  const now = Date.now()
  return ((data as unknown as Array<{
    id: string; record_id: string; channel: string; outcome: string | null; follow_up_at: string
    records: { title: string | null; board_id: string | null } | null
  }>) ?? []).map((r) => ({
    id: r.id,
    recordId: r.record_id,
    recordTitle: r.records?.title ?? null,
    boardId: r.records?.board_id ?? null,
    outcome: r.outcome,
    channel: r.channel,
    followUpAt: r.follow_up_at,
    overdue: new Date(r.follow_up_at).getTime() < now,
  }))
}
