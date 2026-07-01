'use server'

// ─────────────────────────────────────────────────────────────────────────
// Phase D3-FI — financial line-item CRUD for the Financial Info tab.
//
// Items live in record_financial_items (category-discriminated; data JSONB by
// slug). After any change the section totals are recomputed and mirrored into
// the record's hidden monthly_income / total_assets / monthly_liabilities
// fields so the Overview File Summary + a future DTI (D2) can read them.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { upsertFieldValue } from '@/features/records/actions'
import { itemAmount, type FinCategory } from '@/features/mortgage/financialFields'

export type FinancialItem = {
  id: string
  record_id: string
  organization_id: string
  borrower_id: string | null
  category: FinCategory
  position: number
  data: Record<string, unknown>
}

export async function getFinancials(recordId: string): Promise<FinancialItem[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('record_financial_items')
    .select('*')
    .eq('record_id', recordId)
    .order('category', { ascending: true })
    .order('position', { ascending: true })
  return (data ?? []) as FinancialItem[]
}

export async function addFinancialItem(recordId: string, category: FinCategory, borrowerId?: string | null): Promise<FinancialItem | null> {
  const supabase = await createClient()
  const { data: rec } = await supabase.from('records').select('organization_id').eq('id', recordId).maybeSingle()
  if (!rec) return null
  const { data: existing } = await supabase.from('record_financial_items').select('position').eq('record_id', recordId).eq('category', category)
  const pos = (existing ?? []).reduce((m: number, r: any) => Math.max(m, r.position), -1) + 1
  const { data } = await supabase
    .from('record_financial_items')
    .insert({ organization_id: rec.organization_id, record_id: recordId, category, borrower_id: borrowerId ?? null, position: pos, data: {} })
    .select().maybeSingle()
  return (data as FinancialItem) ?? null
}

export async function saveFinancialItem(itemId: string, patch: Record<string, unknown>, borrowerId?: string | null): Promise<void> {
  const supabase = await createClient()
  const { data: row } = await supabase.from('record_financial_items').select('id, record_id, data').eq('id', itemId).maybeSingle()
  if (!row) return
  const newData = { ...((row as any).data ?? {}), ...patch }
  const update: Record<string, unknown> = { data: newData }
  if (borrowerId !== undefined) update.borrower_id = borrowerId
  await supabase.from('record_financial_items').update(update).eq('id', itemId)
  await recomputeAndMirror(supabase, (row as any).record_id)
}

export async function removeFinancialItem(itemId: string): Promise<void> {
  const supabase = await createClient()
  const { data: row } = await supabase.from('record_financial_items').select('record_id').eq('id', itemId).maybeSingle()
  await supabase.from('record_financial_items').delete().eq('id', itemId)
  if (row) await recomputeAndMirror(supabase, (row as any).record_id)
}

// ── Totals → record mirror ───────────────────────────────────────────────────
type SB = Awaited<ReturnType<typeof createClient>>

async function recomputeAndMirror(supabase: SB, recordId: string): Promise<void> {
  const { data: rec } = await supabase.from('records').select('board_id, organization_id').eq('id', recordId).maybeSingle()
  if (!rec?.board_id) return

  const { data: items } = await supabase.from('record_financial_items').select('category, data').eq('record_id', recordId)
  let income = 0, assets = 0, liabilities = 0
  for (const it of (items ?? []) as { category: FinCategory; data: Record<string, unknown> }[]) {
    const amt = itemAmount(it.category, it.data ?? {})
    if (it.category === 'income') income += amt
    else if (it.category === 'asset') assets += amt
    else if (it.category === 'liability') liabilities += amt
  }

  const fieldIds = await ensureMirrorFields(supabase, rec.board_id as string, rec.organization_id as string)
  const writes: [string | undefined, number][] = [
    [fieldIds.monthly_income, income],
    [fieldIds.total_assets, assets],
    [fieldIds.monthly_liabilities, liabilities],
  ]
  for (const [fieldId, total] of writes) {
    if (fieldId) {
      try { await upsertFieldValue(fieldId, recordId, rec.board_id as string, { value_number: total } ) } catch { /* best effort */ }
    }
  }
}

// Hidden currency fields that hold the mirrored totals (created on demand).
async function ensureMirrorFields(supabase: SB, boardId: string, orgId: string): Promise<Record<string, string | undefined>> {
  const defs: [string, string][] = [
    ['monthly_income', 'Monthly Income'],
    ['total_assets', 'Total Assets'],
    ['monthly_liabilities', 'Monthly Liabilities'],
  ]
  const { data: existing } = await supabase.from('fields').select('id, slug').eq('board_id', boardId)
  const bySlug = new Map((existing ?? []).map((f: any) => [f.slug, f.id]))
  const missing = defs.filter(([slug]) => !bySlug.has(slug))
  if (missing.length > 0) {
    const rows = missing.map(([slug, label], i) => ({
      organization_id: orgId, board_id: boardId, name: label, slug, field_type: 'currency',
      position: 9100 + i, config: { hidden_from_grid: true, system: 'loan' },
    }))
    await supabase.from('fields').upsert(rows, { onConflict: 'organization_id,board_id,slug', ignoreDuplicates: true })
    const { data: refreshed } = await supabase.from('fields').select('id, slug').eq('board_id', boardId).in('slug', defs.map(([s]) => s))
    for (const f of refreshed ?? []) bySlug.set((f as any).slug, (f as any).id)
  }
  return {
    monthly_income: bySlug.get('monthly_income'),
    total_assets: bySlug.get('total_assets'),
    monthly_liabilities: bySlug.get('monthly_liabilities'),
  }
}
