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
    .gte('follow_up_at', windowStart.toISOString())
    .lte('follow_up_at', endOfToday.toISOString())
  return count ?? 0
}
