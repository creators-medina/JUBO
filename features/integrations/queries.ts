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

export type WorkerRunRow = {
  id: string
  organization_id: string | null
  worker_type: string
  status: string
  started_at: string
  finished_at: string | null
  duration_ms: number | null
  summary: Record<string, unknown>
  error_message: string | null
}

export async function getWorkerRuns(organizationId: string, limit = 10): Promise<WorkerRunRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('worker_runs')
    .select('*')
    .eq('organization_id', organizationId)
    .order('started_at', { ascending: false })
    .limit(limit)
  return (data as WorkerRunRow[] | null) ?? []
}

export type StageMappingRow = {
  id: string
  organization_id: string
  keyword: string
  board_slug: string
  group_name: string
  stage_order: number
  enabled: boolean
  position: number
}

export async function getStageMappings(organizationId: string): Promise<StageMappingRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('integration_stage_mappings')
    .select('*')
    .eq('organization_id', organizationId)
    .order('stage_order', { ascending: true })
  return (data as StageMappingRow[] | null) ?? []
}
