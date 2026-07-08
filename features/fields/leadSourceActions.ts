'use server'

// ─────────────────────────────────────────────────────────────────────────
// Phase 5 — lead-source field provisioning (single board, user-triggered).
//
// Modeled exactly on the established ensureLoanPropertyFields pattern
// (features/mortgage/loanFieldActions.ts): an idempotent, slug-guarded
// upsert that creates ONE missing `lead_source` select field on ONE board
// when the LO explicitly clicks "Set up lead source" on a record card.
//
// Guarantees:
// • No records are touched and no values are written — ever. Assigning a
//   source to a record is a separate, per-record user action.
// • Existing `lead_source` fields (template-seeded or imported) are left
//   completely untouched — ignoreDuplicates means a lost race or an
//   existing field is a no-op, never an overwrite.
// • hidden_from_grid keeps the new field card-only so no board grid gains
//   a surprise column; the LO can expose it via the board UI if wanted.
// • No schema changes — this inserts a row into the existing `fields`
//   table through the same write path the app already uses.
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { LEAD_SOURCE_LABELS } from '@/features/production-plan/calc'

export async function ensureLeadSourceField(boardId: string, organizationId: string): Promise<void> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('fields')
    .select('id')
    .eq('board_id', boardId)
    .eq('slug', 'lead_source')
    .limit(1)
  if (existing && existing.length > 0) return

  const { error } = await supabase
    .from('fields')
    .upsert(
      [{
        organization_id: organizationId,
        board_id: boardId,
        name: 'Lead Source',
        slug: 'lead_source',
        field_type: 'select',
        position: 9500,
        config: {
          hidden_from_grid: true,
          system: 'lead_source',
          options: LEAD_SOURCE_LABELS.map((label) => ({
            id: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
            label,
          })),
        },
      }],
      { onConflict: 'organization_id,board_id,slug', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}
