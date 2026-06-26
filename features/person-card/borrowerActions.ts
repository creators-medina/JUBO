'use server'

// ─────────────────────────────────────────────────────────────────────────
// Phase D3-BI — borrower CRUD for the Borrower Info tab.
//
// Borrowers live in record_borrowers (one row per borrower; data JSONB by slug).
// The PRIMARY borrower's email/cell_phone are mirrored into the record's
// phone/email field_values so the header Call/Email + SMS composer keep working.
// Read-only-safe: nothing here throws to the caller beyond the DB layer.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { upsertFieldValue } from '@/features/records/actions'

export type BorrowerRow = {
  id: string
  record_id: string
  organization_id: string
  position: number
  is_primary: boolean
  data: Record<string, unknown>
}

export async function getBorrowers(recordId: string): Promise<BorrowerRow[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('record_borrowers').select('*').eq('record_id', recordId).order('position', { ascending: true })
  return (data ?? []) as BorrowerRow[]
}

/** Ensure a primary borrower exists, seeded from the record name + existing
 *  phone/email field values. Returns the full borrower list. */
export async function ensurePrimaryBorrower(recordId: string): Promise<BorrowerRow[]> {
  const supabase = await createClient()
  const existing = await getBorrowers(recordId)
  if (existing.length > 0) return existing

  const { data: rec } = await supabase.from('records').select('id, organization_id, board_id, title').eq('id', recordId).maybeSingle()
  if (!rec) return []

  const seed: Record<string, unknown> = {}
  const parts = String(rec.title ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length) { seed.first_name = parts[0]; if (parts.length > 1) seed.last_name = parts.slice(1).join(' ') }

  if (rec.board_id) {
    const { data: fields } = await supabase.from('fields').select('id, slug, field_type').eq('board_id', rec.board_id)
    const phoneField = (fields ?? []).find((f: any) => f.slug === 'phone' || f.field_type === 'phone')
    const emailField = (fields ?? []).find((f: any) => f.slug === 'email' || f.field_type === 'email')
    const ids = [phoneField?.id, emailField?.id].filter(Boolean) as string[]
    if (ids.length) {
      const { data: fvs } = await supabase.from('field_values').select('field_id, value_text').eq('record_id', recordId).in('field_id', ids)
      for (const fv of fvs ?? []) {
        if (phoneField && (fv as any).field_id === phoneField.id && (fv as any).value_text) seed.cell_phone = (fv as any).value_text
        if (emailField && (fv as any).field_id === emailField.id && (fv as any).value_text) seed.email = (fv as any).value_text
      }
    }
  }

  const { data: created } = await supabase
    .from('record_borrowers')
    .insert({ organization_id: rec.organization_id, record_id: recordId, position: 0, is_primary: true, data: seed })
    .select().maybeSingle()
  return created ? [created as BorrowerRow] : []
}

export async function addBorrower(recordId: string): Promise<BorrowerRow | null> {
  const supabase = await createClient()
  const { data: rec } = await supabase.from('records').select('organization_id').eq('id', recordId).maybeSingle()
  if (!rec) return null
  const existing = await getBorrowers(recordId)
  const pos = existing.reduce((m, b) => Math.max(m, b.position), -1) + 1
  const { data } = await supabase
    .from('record_borrowers')
    .insert({ organization_id: rec.organization_id, record_id: recordId, position: pos, is_primary: existing.length === 0, data: {} })
    .select().maybeSingle()
  return (data as BorrowerRow) ?? null
}

export async function removeBorrower(borrowerId: string): Promise<void> {
  const supabase = await createClient()
  await supabase.from('record_borrowers').delete().eq('id', borrowerId)
}

export async function saveBorrower(borrowerId: string, patch: Record<string, unknown>): Promise<void> {
  const supabase = await createClient()
  const { data: row } = await supabase.from('record_borrowers').select('id, record_id, is_primary, data').eq('id', borrowerId).maybeSingle()
  if (!row) return
  const newData = { ...((row as any).data ?? {}), ...patch }
  await supabase.from('record_borrowers').update({ data: newData }).eq('id', borrowerId)

  // Mirror the primary borrower's contact into the record's phone/email fields.
  if ((row as any).is_primary && ('email' in patch || 'cell_phone' in patch)) {
    const { data: rec } = await supabase.from('records').select('board_id').eq('id', (row as any).record_id).maybeSingle()
    if (rec?.board_id) {
      const { data: fields } = await supabase.from('fields').select('id, slug, field_type').eq('board_id', rec.board_id)
      const phoneField = (fields ?? []).find((f: any) => f.slug === 'phone' || f.field_type === 'phone')
      const emailField = (fields ?? []).find((f: any) => f.slug === 'email' || f.field_type === 'email')
      try {
        if ('cell_phone' in patch && phoneField) await upsertFieldValue(phoneField.id, (row as any).record_id, rec.board_id, { value_text: (patch.cell_phone as string) ?? null })
        if ('email' in patch && emailField) await upsertFieldValue(emailField.id, (row as any).record_id, rec.board_id, { value_text: (patch.email as string) ?? null })
      } catch { /* mirror is best-effort */ }
    }
  }
}
