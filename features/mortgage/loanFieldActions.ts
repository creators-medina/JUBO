'use server'

// ─────────────────────────────────────────────────────────────────────────
// Phase D3-LP — provision the Loan & Property field set on a loan board.
//
// Idempotent by slug: creates only the missing fields, marked
// config.hidden_from_grid so they power the card but never clutter the board
// table (getGroupVisibleFields filters them out of the grid). Computed cells
// (LTV/Total/PITI) are not provisioned — they're derived in the UI.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { provisionableLoanFields } from './loanFields'

export async function ensureLoanPropertyFields(boardId: string, organizationId: string): Promise<void> {
  const supabase = await createClient()

  const { data: existing } = await supabase.from('fields').select('slug').eq('board_id', boardId)
  const have = new Set((existing ?? []).map((f: { slug: string }) => f.slug))
  const missing = provisionableLoanFields().filter((f) => !have.has(f.slug))
  if (missing.length === 0) return

  const rows = missing.map((f, i) => ({
    organization_id: organizationId,
    board_id: boardId,
    name: f.label,
    slug: f.slug,
    field_type: f.type,
    position: 9000 + i,
    config: {
      hidden_from_grid: true,
      system: 'loan',
      ...(f.options
        ? { options: f.options.map((o) => ({ id: o.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label: o })) }
        : {}),
    },
  }))

  // upsert + ignoreDuplicates makes concurrent first-opens safe (slug is unique
  // per board); a lost race just no-ops instead of throwing.
  const { error } = await supabase
    .from('fields')
    .upsert(rows, { onConflict: 'board_id,slug', ignoreDuplicates: true })
  if (error) throw new Error(error.message)
}
