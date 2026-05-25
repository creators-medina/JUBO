import { createClient } from '@/lib/supabase/server'
import type { IntegrationConnectionRow, IntegrationEventRow } from './types'

export async function getConnections(organizationId: string): Promise<IntegrationConnectionRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('integration_connections')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  return (data as IntegrationConnectionRow[] | null) ?? []
}

export async function getConnection(connectionId: string): Promise<IntegrationConnectionRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('integration_connections').select('*').eq('id', connectionId).maybeSingle()
  return (data as IntegrationConnectionRow | null) ?? null
}

export async function getRecentEvents(organizationId: string, limit = 50): Promise<IntegrationEventRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('integration_events')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as IntegrationEventRow[] | null) ?? []
}
