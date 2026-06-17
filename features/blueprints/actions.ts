'use server'

// ─────────────────────────────────────────────────────────────────────────
// Blueprint preview + apply (Phase 38B/38C).
//
// previewBlueprint: validate + (when valid) persist the resolved plan as a
//   `draft` blueprint_applications row keyed by apply_token. Read-only to
//   production structure.
// applyBlueprint: CREATE-ONLY. Executes the STORED plan (never raw JSON),
//   atomically claims the token (concurrency-safe), records created board ids as
//   it goes, and on ANY failure hard-deletes every board it created (recoverable
//   substitute for transactional rollback). Idempotent: a succeeded token returns
//   its result and creates nothing. Reuses the TS structure helpers — no SQL
//   re-implementation. No records/values/automations.
// ─────────────────────────────────────────────────────────────────────────

import { randomUUID } from 'crypto'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ensureDefaultStatusField } from '@/features/fields/defaultStatus'
import { defaultStatusOptions } from '@/features/fields/status'
import { isTypeCompatible } from '@/features/fields/commonFields'
import { validateBlueprint, type ValidateContext } from './validate'
import { NAME_ALIAS_KEYS, type Blueprint, type BlueprintPreviewPlan } from './types'

function emptyPlan(applyToken: string, blocking: string): BlueprintPreviewPlan {
  return {
    applyToken, valid: false,
    summary: { boards: 0, groups: 0, fields: 0, checklistFields: 0, automationsDeferred: 0, warnings: 0, blockingErrors: 1 },
    willCreate: [], warnings: [],
    blockingErrors: [{ type: 'validation', label: 'Blueprint', path: '$', message: blocking, severity: 'error' }],
    unsupportedDeferred: [], commonFieldBindings: [], resolvedBlueprint: null,
  }
}

async function resolveOrgId(supabase: any, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', userId)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  return (data as { organization_id?: string } | null)?.organization_id ?? null
}

export async function previewBlueprint(jsonInput: string): Promise<BlueprintPreviewPlan> {
  const applyToken = randomUUID()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return emptyPlan(applyToken, 'Not authenticated.')

  let parsed: Blueprint
  try { parsed = JSON.parse(jsonInput) } catch (e) {
    return emptyPlan(applyToken, `Invalid JSON: ${e instanceof Error ? e.message : 'could not parse'}`)
  }

  const orgId = await resolveOrgId(supabase, user.id)
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

  // Persist the resolved plan as a draft ONLY when valid (Rule 1/2). Apply later
  // loads + executes THIS stored plan — never raw JSON.
  if (plan.valid) {
    const storedPlan = {
      version: parsed.version,
      boards: (plan.resolvedBlueprint as any)?.boards ?? [],
      automations: Array.isArray(parsed.automations) ? parsed.automations : [],
    }
    await supabase.from('blueprint_applications').insert({
      organization_id: orgId, apply_token: applyToken, status: 'draft', plan: storedPlan, created_by: user.id,
    })
  }

  return { applyToken, ...plan }
}

export type ApplyResult = {
  ok: boolean
  result?: { boards: { id: string; name: string; slug: string }[] }
  error?: string
  alreadyApplied?: boolean
  applying?: boolean
  retrySafe?: boolean
}

export async function applyBlueprint(applyToken: string): Promise<ApplyResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const orgId = await resolveOrgId(supabase, user.id)
  if (!orgId) return { ok: false, error: 'No organization found.' }

  const now = () => new Date().toISOString()

  // ── Atomic claim: only a draft/failed token can be claimed; the update is the
  // lock, so two concurrent requests can't both own the apply. ──
  const { data: claimed } = await supabase
    .from('blueprint_applications')
    .update({ status: 'applying', updated_at: now() })
    .eq('apply_token', applyToken).eq('organization_id', orgId).in('status', ['draft', 'failed'])
    .select('*').maybeSingle()

  let row = claimed as any
  if (!row) {
    const { data: existing } = await supabase
      .from('blueprint_applications').select('*').eq('apply_token', applyToken).eq('organization_id', orgId).maybeSingle()
    if (!existing) return { ok: false, error: 'Blueprint plan not found for this organization.' }
    if (existing.status === 'succeeded') return { ok: true, alreadyApplied: true, result: existing.result }
    if (existing.status === 'applying') return { ok: false, applying: true, error: 'This blueprint is already being applied.' }
    return { ok: false, error: existing.error ?? 'Could not claim blueprint.', retrySafe: true }
  }

  const plan = (row.plan ?? {}) as { boards?: any[] }
  const planBoards = Array.isArray(plan.boards) ? plan.boards : []
  const createdBoardIds: string[] = []

  // Hard-delete every board created under this token; mark failed. The app-level
  // substitute for transactional rollback — a fresh board cascades groups/fields/
  // values/visibility/requirements (records.board_id is SET NULL; none created).
  const cleanupFail = async (msg: string): Promise<ApplyResult> => {
    for (const bid of createdBoardIds) {
      await supabase.from('boards').delete().eq('id', bid).eq('organization_id', orgId)
    }
    await supabase.from('blueprint_applications')
      .update({ status: 'failed', error: msg, created_board_ids: [], updated_at: now() }).eq('id', row.id)
    return { ok: false, error: msg, retrySafe: true }
  }

  // ── Defense-in-depth re-checks across the WHOLE plan before creating anything ──
  for (const b of planBoards) {
    const fields = Array.isArray(b.fields) ? b.fields : []
    if (fields.filter((f: any) => f.is_default_status).length > 1) {
      return cleanupFail(`Board "${b.name}" declares more than one default status field.`)
    }
    for (const f of fields) {
      if (f.common_field_key && NAME_ALIAS_KEYS.has(f.common_field_key)) {
        return cleanupFail('Name is not bindable as a common field. Apply aborted.')
      }
    }
  }

  const { data: keys } = await supabase.from('common_field_keys').select('id, key, data_type').eq('organization_id', orgId)
  const keyMap = new Map((keys ?? []).map((k: any) => [k.key, k]))

  try {
    const resultBoards: { id: string; name: string; slug: string }[] = []

    for (const b of planBoards) {
      const { data: board, error: bErr } = await supabase.from('boards')
        .insert({ organization_id: orgId, name: b.name, slug: b.slug, board_type: b.board_type ?? 'custom', description: b.description ?? null, created_by: user.id })
        .select('id').single()
      if (bErr || !board) throw new Error(bErr?.message ?? 'Could not create board')
      createdBoardIds.push(board.id)
      await supabase.from('blueprint_applications').update({ created_board_ids: createdBoardIds, updated_at: now() }).eq('id', row.id)

      // Groups (declared order; default 'New' if none, matching createBoard).
      const groups = Array.isArray(b.groups) && b.groups.length > 0 ? b.groups : [{ key: '__new__', name: 'New', color: null, position: 0 }]
      const keyToGroupId = new Map<string, string>()
      for (const g of groups) {
        const { data: grp, error } = await supabase.from('board_groups')
          .insert({ board_id: board.id, name: g.name, color: g.color ?? null, position: g.position ?? 0 }).select('id').single()
        if (error || !grp) throw new Error(error?.message ?? 'Could not create group')
        if (g.key) keyToGroupId.set(g.key, grp.id)
      }

      const claimedKeyIds = new Set<string>()
      const linkGroups = async (fieldId: string, table: 'field_group_visibility' | 'field_requirements', groupKeys: string[]) => {
        for (const gk of groupKeys ?? []) {
          const gid = keyToGroupId.get(gk)
          if (!gid) throw new Error(`Unresolved group reference "${gk}" reached apply.`)
          const payload: any = { organization_id: orgId, field_id: fieldId, group_id: gid }
          if (table === 'field_requirements') payload.is_required = true
          const { error } = await supabase.from(table).insert(payload)
          if (error) throw new Error(error.message)
        }
      }

      // Fields (by position).
      const fields = [...(Array.isArray(b.fields) ? b.fields : [])].sort((a, b2) => (a.position ?? 0) - (b2.position ?? 0))
      for (const f of fields) {
        let config: any = {}
        if (f.type === 'status' || f.type === 'select') {
          const opts = (Array.isArray(f.options) ? f.options : []).map((o: any) => ({ id: randomUUID(), label: o.label, ...(o.color ? { color: o.color } : {}) }))
          config = { options: opts.length > 0 ? opts : (f.type === 'status' ? defaultStatusOptions() : []) }
        }
        let commonId: string | null = null
        if (f.common_field_key) {
          const reg = keyMap.get(f.common_field_key) as any
          if (!reg) throw new Error(`Unknown common field key "${f.common_field_key}".`)
          if (!isTypeCompatible(f.type, reg.data_type)) throw new Error(`Common key "${f.common_field_key}" not type-compatible.`)
          if (claimedKeyIds.has(reg.id)) throw new Error(`Common key "${f.common_field_key}" claimed twice on one board.`)
          claimedKeyIds.add(reg.id); commonId = reg.id
        }
        const { data: fld, error } = await supabase.from('fields').insert({
          organization_id: orgId, board_id: board.id, name: f.name, slug: f.slug, field_type: f.type,
          config, position: f.position ?? 0, is_default_status: !!f.is_default_status, common_field_key_id: commonId,
        }).select('id').single()
        if (error || !fld) throw new Error(error?.message ?? 'Could not create field')
        await linkGroups(fld.id, 'field_group_visibility', f.visible_in_group_keys)
        await linkGroups(fld.id, 'field_requirements', f.required_in_group_keys)
      }

      // Checklist items → field_type='checklist' fields.
      const checklist = Array.isArray(b.checklist) ? b.checklist : []
      let clPos = 1000
      for (const c of checklist) {
        const { data: fld, error } = await supabase.from('fields').insert({
          organization_id: orgId, board_id: board.id, name: c.name, slug: c.slug, field_type: 'checklist',
          config: {}, position: clPos++, is_default_status: false,
        }).select('id').single()
        if (error || !fld) throw new Error(error?.message ?? 'Could not create checklist field')
        await linkGroups(fld.id, 'field_group_visibility', c.visible_in_group_keys)
      }

      // Exactly one default workflow status (declared one is a no-op; else create/promote).
      await ensureDefaultStatusField(supabase, board.id, orgId)

      resultBoards.push({ id: board.id, name: b.name, slug: b.slug })
    }

    await supabase.from('blueprint_applications')
      .update({ status: 'succeeded', result: { boards: resultBoards }, applied_at: now(), updated_at: now() }).eq('id', row.id)
    revalidatePath('/boards')
    return { ok: true, result: { boards: resultBoards } }
  } catch (e) {
    return cleanupFail(e instanceof Error ? e.message : 'Apply failed.')
  }
}
