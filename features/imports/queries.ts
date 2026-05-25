import { createClient } from '@/lib/supabase/server'
import type { ImportRow } from './types'

export async function getImports(organizationId: string, limit = 50): Promise<ImportRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('imports')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data as ImportRow[] | null) ?? []
}

export async function getImport(importId: string): Promise<ImportRow | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('imports').select('*').eq('id', importId).maybeSingle()
  return (data as ImportRow | null) ?? null
}

/** Failed rows for an import (used by retry). */
export async function getFailedImportRows(importId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('import_rows')
    .select('id, row_index, status, error, source_data')
    .eq('import_id', importId)
    .eq('status', 'failed')
    .order('row_index', { ascending: true })
  return data ?? []
}
