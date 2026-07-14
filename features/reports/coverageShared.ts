// ─────────────────────────────────────────────────────────────────────────
// Lead Source & Ownership Coverage — pure shared pieces (types, labels,
// classification). No data access — importable from both the server
// aggregation and the client report UI.
// ─────────────────────────────────────────────────────────────────────────

import { LEAD_SOURCE_LABELS, SOURCE_ALIASES } from '@/features/production-plan/calc'

export type SourceClass = 'canonical' | 'alias' | 'ambiguous' | 'unknown' | 'unassigned'
export type OwnerResolution = 'owner' | 'assigned' | 'created_by' | 'unresolved'

export const OWNER_LABEL: Record<OwnerResolution, string> = {
  owner: 'Owner',
  assigned: 'Assigned',
  created_by: 'Created-by fallback',
  unresolved: 'Unresolved',
}

const normalize = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const CANONICAL_NORMALIZED = new Set(LEAD_SOURCE_LABELS.map(normalize))
// Known-but-unmappable values (see JUBO_LEAD_SOURCE_BACKFILL_PLAN.md) — they
// stay visible as themselves, never coerced.
const AMBIGUOUS_NORMALIZED = new Set(['past client', 'self sourced', 'purchased lead', 'referral'])

/** Display-only classification of a stored lead-source value. */
export function classifySource(raw: string | null | undefined): SourceClass {
  if (!raw || !raw.trim()) return 'unassigned'
  const n = normalize(raw)
  if (CANONICAL_NORMALIZED.has(n)) return 'canonical'
  if (SOURCE_ALIASES[n]) return 'alias'
  if (AMBIGUOUS_NORMALIZED.has(n)) return 'ambiguous'
  return 'unknown'
}

/** Same safe order established in Phase 5 — labeled honestly, never claimed
 *  as perfect per-LO ownership when a fallback was used. */
export function resolveOwnership(r: { owner_user_id: string | null; assigned_user_id: string | null; created_by: string | null }): { resolution: OwnerResolution; userId: string | null } {
  if (r.owner_user_id) return { resolution: 'owner', userId: r.owner_user_id }
  if (r.assigned_user_id) return { resolution: 'assigned', userId: r.assigned_user_id }
  if (r.created_by) return { resolution: 'created_by', userId: r.created_by }
  return { resolution: 'unresolved', userId: null }
}
