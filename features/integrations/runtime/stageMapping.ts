// ─────────────────────────────────────────────────────────────────────────
// Status/milestone → board-stage mapping (configurable per org).
//
// Loaded from integration_stage_mappings when present, else code defaults.
// `stageOrder` is a global ordering used by the backward-movement guard so a
// stale "Processing" event can't drag a "Funded" file backward. No hardcoded ids.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { NormalizedEvent } from '../types'

export type StageMapping = { keyword: string; boardSlug: string; groupName: string; stageOrder: number }

export const DEFAULT_STAGE_MAPPINGS: StageMapping[] = [
  { keyword: 'new',            boardSlug: 'active-leads',  groupName: 'New Inquiry',    stageOrder: 1 },
  { keyword: 'inquiry',        boardSlug: 'active-leads',  groupName: 'New Inquiry',    stageOrder: 1 },
  { keyword: 'lead',           boardSlug: 'active-leads',  groupName: 'New Inquiry',    stageOrder: 1 },
  { keyword: 'credit',         boardSlug: 'active-leads',  groupName: 'Credit Pull',    stageOrder: 2 },
  { keyword: 'application',    boardSlug: 'active-leads',  groupName: 'Credit Pull',    stageOrder: 2 },
  { keyword: 'applied',        boardSlug: 'active-leads',  groupName: 'Credit Pull',    stageOrder: 2 },
  { keyword: 'preapprov',      boardSlug: 'active-leads',  groupName: 'Preapproved',    stageOrder: 3 },
  { keyword: 'pre-approv',     boardSlug: 'active-leads',  groupName: 'Preapproved',    stageOrder: 3 },
  { keyword: 'shopping',       boardSlug: 'active-leads',  groupName: 'Shopping',       stageOrder: 4 },
  { keyword: 'prequal',        boardSlug: 'active-leads',  groupName: 'Shopping',       stageOrder: 4 },
  { keyword: 'under contract', boardSlug: 'active-leads',  groupName: 'Under Contract', stageOrder: 5 },
  { keyword: 'contract',       boardSlug: 'active-leads',  groupName: 'Under Contract', stageOrder: 5 },
  { keyword: 'processing',     boardSlug: 'loan-pipeline', groupName: 'Processing',     stageOrder: 6 },
  { keyword: 'submitted',      boardSlug: 'loan-pipeline', groupName: 'Processing',     stageOrder: 6 },
  { keyword: 'in process',     boardSlug: 'loan-pipeline', groupName: 'Processing',     stageOrder: 6 },
  { keyword: 'condition',      boardSlug: 'loan-pipeline', groupName: 'Conditions',     stageOrder: 7 },
  { keyword: 'clear to close', boardSlug: 'loan-pipeline', groupName: 'Clear to Close', stageOrder: 8 },
  { keyword: 'ctc',            boardSlug: 'loan-pipeline', groupName: 'Clear to Close', stageOrder: 8 },
  { keyword: 'funded',         boardSlug: 'loan-pipeline', groupName: 'Funded',         stageOrder: 9 },
  { keyword: 'closed',         boardSlug: 'loan-pipeline', groupName: 'Funded',         stageOrder: 9 },
]

/** Org overrides if any rows exist, else the code defaults. */
export async function loadStageMappings(client: SupabaseClient, organizationId: string): Promise<StageMapping[]> {
  const { data } = await client
    .from('integration_stage_mappings')
    .select('keyword, board_slug, group_name, stage_order')
    .eq('organization_id', organizationId)
    .eq('enabled', true)
    .order('stage_order', { ascending: true })
  if (data && data.length > 0) {
    return data.map((d) => ({ keyword: d.keyword, boardSlug: d.board_slug, groupName: d.group_name, stageOrder: d.stage_order }))
  }
  return DEFAULT_STAGE_MAPPINGS
}

/** Best (most-advanced) matching mapping for an event's milestone/status. */
export function resolveTarget(mappings: StageMapping[], ev: NormalizedEvent): StageMapping | null {
  const text = `${ev.loan.milestone ?? ''} ${ev.loan.status ?? ''}`.toLowerCase()
  if (!text.trim()) return null
  let best: StageMapping | null = null
  for (const m of mappings) {
    if (text.includes(m.keyword.toLowerCase())) {
      if (!best || m.stageOrder > best.stageOrder) best = m
    }
  }
  return best
}

/** Order of the record's CURRENT stage (for the regression guard); null if unknown. */
export function currentStageOrder(mappings: StageMapping[], boardSlug: string | null, groupName: string | null): number | null {
  if (!boardSlug || !groupName) return null
  const m = mappings.find((x) => x.boardSlug === boardSlug && x.groupName.toLowerCase() === groupName.toLowerCase())
  return m ? m.stageOrder : null
}

/** Rows to seed integration_stage_mappings for an org (used by the settings UI). */
export function defaultSeedRows(organizationId: string) {
  return DEFAULT_STAGE_MAPPINGS.map((m, i) => ({
    organization_id: organizationId,
    keyword: m.keyword,
    board_slug: m.boardSlug,
    group_name: m.groupName,
    stage_order: m.stageOrder,
    enabled: true,
    position: i,
  }))
}
