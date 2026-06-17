'use server'

// ─────────────────────────────────────────────────────────────────────────
// Blueprint preview (Phase 38B) — READ-ONLY. Parses + validates a pasted JSON
// blueprint and returns a stable dry-run apply plan. Creates NOTHING. Scoped to
// the caller's org via RLS-backed reads.
// ─────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { validateBlueprint, type ValidateContext } from './validate'
import type { Blueprint, BlueprintPreviewPlan } from './types'

function emptyPlan(applyToken: string, blocking: string): BlueprintPreviewPlan {
  return {
    applyToken,
    valid: false,
    summary: { boards: 0, groups: 0, fields: 0, checklistFields: 0, automationsDeferred: 0, warnings: 0, blockingErrors: 1 },
    willCreate: [],
    warnings: [],
    blockingErrors: [{ type: 'validation', label: 'Blueprint', path: '$', message: blocking, severity: 'error' }],
    unsupportedDeferred: [],
    commonFieldBindings: [],
    resolvedBlueprint: null,
  }
}

export async function previewBlueprint(jsonInput: string): Promise<BlueprintPreviewPlan> {
  // Idempotency key for the future 38C apply. Generated per preview; not persisted.
  const applyToken = randomUUID()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return emptyPlan(applyToken, 'Not authenticated.')

  let parsed: Blueprint
  try {
    parsed = JSON.parse(jsonInput)
  } catch (e) {
    return emptyPlan(applyToken, `Invalid JSON: ${e instanceof Error ? e.message : 'could not parse'}`)
  }

  // Org context (RLS-scoped to the caller's org): existing board names/slugs +
  // the common-field registry. Read-only.
  const { data: m } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  const orgId = (m as { organization_id?: string } | null)?.organization_id
  if (!orgId) return emptyPlan(applyToken, 'No organization found for the current user.')

  const [{ data: boards }, { data: keys }] = await Promise.all([
    supabase.from('boards').select('name, slug').eq('organization_id', orgId),
    supabase.from('common_field_keys').select('id, key, label, data_type, scope').eq('organization_id', orgId),
  ])

  const ctx: ValidateContext = {
    existingBoardSlugs: new Set((boards ?? []).map((b: { slug: string }) => b.slug)),
    existingBoardNames: new Set((boards ?? []).map((b: { name: string }) => b.name)),
    commonKeys: new Map((keys ?? []).map((k: any) => [k.key, k])),
  }

  const plan = validateBlueprint(parsed, ctx)
  return { applyToken, ...plan }
}
