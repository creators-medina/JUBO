// ─────────────────────────────────────────────────────────────────────────
// Blueprint validator / preview resolver (Phase 38B) — PURE + READ-ONLY.
//
// Produces a stable dry-run apply plan (the 38C apply will execute this plan,
// not re-interpret raw input — preview and apply must not drift). Nothing here
// mutates anything; DB context (existing board names/slugs, the org common-field
// registry) is passed in by the caller.
// ─────────────────────────────────────────────────────────────────────────

import { isTypeCompatible } from '@/features/fields/commonFields'
import {
  BLUEPRINT_VERSION, SUPPORTED_BOARD_TYPES, SUPPORTED_FIELD_TYPES, NAME_ALIAS_KEYS,
  type Blueprint, type BlueprintPreviewPlan, type PreviewItem,
} from './types'

export type ValidateContext = {
  existingBoardSlugs: Set<string>
  existingBoardNames: Set<string>
  commonKeys: Map<string, { id: string; label: string; data_type: string; scope: string }>
}

const HEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function slugify(s: string, fallback = 'board'): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || fallback
}

/** Validate a parsed blueprint against org context → a stable preview plan (no applyToken). */
export function validateBlueprint(bp: Blueprint, ctx: ValidateContext): Omit<BlueprintPreviewPlan, 'applyToken'> {
  const willCreate: PreviewItem[] = []
  const warnings: PreviewItem[] = []
  const blockingErrors: PreviewItem[] = []
  const unsupportedDeferred: PreviewItem[] = []
  const commonFieldBindings: PreviewItem[] = []

  const err = (type: PreviewItem['type'], label: string, path: string, message: string) =>
    blockingErrors.push({ type, label, path, message, severity: 'error' })
  const warn = (type: PreviewItem['type'], label: string, path: string, message: string) =>
    warnings.push({ type, label, path, message, severity: 'warning' })

  let fieldCount = 0
  let groupCount = 0
  let checklistCount = 0
  const resolvedBoards: any[] = []

  // ── Top-level ──
  if (typeof bp !== 'object' || bp === null) {
    err('validation', 'Blueprint', '$', 'Blueprint must be a JSON object.')
  }
  if (bp.version === undefined || bp.version === null) {
    err('validation', 'version', '$.version', 'Missing "version".')
  } else if (bp.version !== BLUEPRINT_VERSION) {
    err('validation', 'version', '$.version', `Unsupported version ${bp.version}. Supported: ${BLUEPRINT_VERSION}.`)
  }
  if (bp.boards !== undefined && !Array.isArray(bp.boards)) {
    err('validation', 'boards', '$.boards', '"boards" must be an array.')
  }
  if (bp.automations !== undefined && !Array.isArray(bp.automations)) {
    err('validation', 'automations', '$.automations', '"automations" must be an array if present.')
  }

  const boards = Array.isArray(bp.boards) ? bp.boards : []
  if (boards.length === 0 && blockingErrors.length === 0) {
    warn('validation', 'boards', '$.boards', 'Blueprint has no boards — nothing to create.')
  }

  const seenBoardKeys = new Set<string>()
  const usedSlugs = new Set<string>(ctx.existingBoardSlugs)

  boards.forEach((board, bi) => {
    const bpath = `$.boards[${bi}]`
    const bkey = board?.key
    const blabel = board?.name || bkey || `board ${bi + 1}`

    if (!bkey) err('board', blabel, `${bpath}.key`, 'Board "key" is required.')
    else if (seenBoardKeys.has(bkey)) err('board', blabel, `${bpath}.key`, `Duplicate board key "${bkey}".`)
    else seenBoardKeys.add(bkey)

    if (!board?.name) err('board', blabel, `${bpath}.name`, 'Board "name" is required.')
    if (board?.board_type && !SUPPORTED_BOARD_TYPES.includes(board.board_type as any)) {
      err('board', blabel, `${bpath}.board_type`, `Unsupported board_type "${board.board_type}". Allowed: ${SUPPORTED_BOARD_TYPES.join(', ')}.`)
    }

    // Resolve a deduped slug (against existing + earlier blueprint boards).
    let slug = ''
    if (board?.name) {
      const base = slugify(board.name)
      slug = base
      let n = 1
      while (usedSlugs.has(slug)) slug = `${base}_${n++}`
      usedSlugs.add(slug)
      if (ctx.existingBoardNames.has(board.name)) {
        warn('board', blabel, `${bpath}.name`, `A board named "${board.name}" already exists; the new board will use slug "${slug}".`)
      }
    }

    if (bkey && board?.name) {
      willCreate.push({ type: 'board', label: board.name, path: bpath, message: `Create board "${board.name}" (${board.board_type ?? 'custom'}) · slug ${slug}`, severity: 'info' })
    }

    // ── Groups ──
    const groups = Array.isArray(board?.groups) ? board!.groups! : []
    const groupKeys = new Set<string>()
    groups.forEach((g, gi) => {
      const gpath = `${bpath}.groups[${gi}]`
      const glabel = g?.name || g?.key || `group ${gi + 1}`
      if (!g?.key) err('group', glabel, `${gpath}.key`, 'Group "key" is required.')
      else if (groupKeys.has(g.key)) err('group', glabel, `${gpath}.key`, `Duplicate group key "${g.key}" in board "${blabel}".`)
      else groupKeys.add(g.key)
      if (!g?.name) err('group', glabel, `${gpath}.name`, 'Group "name" is required.')
      if (g?.color && !HEX.test(g.color)) err('group', glabel, `${gpath}.color`, `Invalid color "${g.color}" (use #rgb or #rrggbb).`)
      if (g?.key && g?.name) { groupCount++; willCreate.push({ type: 'group', label: g.name, path: gpath, message: `Group "${g.name}"${g.color ? ` · ${g.color}` : ''}`, severity: 'info' }) }
    })

    const groupRef = (keys: string[] | undefined, path: string, label: string) => {
      for (const k of keys ?? []) {
        if (!groupKeys.has(k)) err('field', label, path, `References unknown group key "${k}".`)
      }
    }

    // ── Fields ──
    const fields = Array.isArray(board?.fields) ? board!.fields! : []
    const fieldKeys = new Set<string>()
    let defaultStatusCount = 0
    const claimedKeys = new Map<string, string>() // commonKeyId → field label (per board)

    fields.forEach((f, fi) => {
      const fpath = `${bpath}.fields[${fi}]`
      const flabel = f?.name || f?.key || `field ${fi + 1}`
      if (!f?.key) err('field', flabel, `${fpath}.key`, 'Field "key" is required.')
      else if (fieldKeys.has(f.key)) err('field', flabel, `${fpath}.key`, `Duplicate field key "${f.key}" in board "${blabel}".`)
      else fieldKeys.add(f.key)
      if (!f?.name) err('field', flabel, `${fpath}.name`, 'Field "name" is required.')

      if (!f?.type) err('field', flabel, `${fpath}.type`, 'Field "type" is required.')
      else if (!SUPPORTED_FIELD_TYPES.includes(f.type as any)) err('field', flabel, `${fpath}.type`, `Unsupported field type "${f.type}".`)

      if (f?.position !== undefined && (typeof f.position !== 'number' || !Number.isFinite(f.position))) {
        err('field', flabel, `${fpath}.position`, 'Field "position" must be a number.')
      }

      // options only valid for status/select
      if (f?.options && f.options.length > 0) {
        if (f.type !== 'status' && f.type !== 'select') {
          err('field', flabel, `${fpath}.options`, `Options are only valid for status/select fields (got "${f.type}").`)
        } else {
          f.options.forEach((o, oi) => {
            if (!o?.label) err('field', flabel, `${fpath}.options[${oi}]`, 'Option "label" is required.')
            if (o?.color && !HEX.test(o.color)) err('field', flabel, `${fpath}.options[${oi}].color`, `Invalid option color "${o.color}".`)
          })
        }
      }

      if (f?.is_default_status) {
        defaultStatusCount++
        if (f.type !== 'status') warn('field', flabel, `${fpath}.is_default_status`, 'Default status field should be of type "status".')
      }

      groupRef(f?.visible_in_groups, `${fpath}.visible_in_groups`, flabel)
      groupRef(f?.required_in_groups, `${fpath}.required_in_groups`, flabel)

      // ── common_field_key (36B rules) ──
      if (f?.common_field_key) {
        const ck = f.common_field_key
        if (NAME_ALIAS_KEYS.has(ck)) {
          err('common_field_key', flabel, `${fpath}.common_field_key`, 'Name is not bindable. Record title is the V1 name source of truth.')
        } else {
          const reg = ctx.commonKeys.get(ck)
          if (!reg) {
            err('common_field_key', flabel, `${fpath}.common_field_key`, `Unknown common field key "${ck}" for this organization.`)
          } else if (f.type && !isTypeCompatible(f.type, reg.data_type)) {
            err('common_field_key', flabel, `${fpath}.common_field_key`, `Field type "${f.type}" is not compatible with common key "${ck}" (${reg.data_type}).`)
          } else if (claimedKeys.has(reg.id)) {
            err('common_field_key', flabel, `${fpath}.common_field_key`, `Common field "${reg.label}" is already mapped by "${claimedKeys.get(reg.id)}" on this board.`)
          } else {
            claimedKeys.set(reg.id, flabel)
            commonFieldBindings.push({ type: 'common_field_key', label: flabel, path: `${fpath}.common_field_key`, message: `"${f?.name}" → ${reg.label} · ${reg.scope}`, severity: 'info' })
          }
        }
      }

      if (f?.key && f?.name && f?.type) { fieldCount++; willCreate.push({ type: 'field', label: f.name, path: fpath, message: `Field "${f.name}" (${f.type})`, severity: 'info' }) }
    })

    if (defaultStatusCount > 1) {
      err('field', blabel, `${bpath}.fields`, `Board "${blabel}" declares ${defaultStatusCount} default status fields; at most one is allowed.`)
    }

    // ── Checklist ──
    const checklist = Array.isArray(board?.checklist) ? board!.checklist! : []
    const clKeys = new Set<string>()
    checklist.forEach((c, ci) => {
      const cpath = `${bpath}.checklist[${ci}]`
      const clabel = c?.name || c?.key || `checklist ${ci + 1}`
      if (!c?.key) err('checklist', clabel, `${cpath}.key`, 'Checklist "key" is required.')
      else if (clKeys.has(c.key)) err('checklist', clabel, `${cpath}.key`, `Duplicate checklist key "${c.key}" in board "${blabel}".`)
      else clKeys.add(c.key)
      if (!c?.name) err('checklist', clabel, `${cpath}.name`, 'Checklist "name" is required.')
      groupRef(c?.visible_in_groups, `${cpath}.visible_in_groups`, clabel)
      if (c?.key && c?.name) { checklistCount++; willCreate.push({ type: 'checklist', label: c.name, path: cpath, message: `Checklist field "${c.name}" (future field_type='checklist')`, severity: 'info' }) }
    })

    // ── Resolved, apply-ready plan: final field/checklist slugs (deduped within
    // the board, across fields + checklist since both become `fields` rows),
    // positions, and group-key references kept for apply to map to UUIDs. ──
    const usedFieldSlugs = new Set<string>()
    const slugField = (name?: string) => {
      const base = slugify(name ?? 'field', 'field')
      let s = base
      let n = 1
      while (usedFieldSlugs.has(s)) s = `${base}_${n++}`
      usedFieldSlugs.add(s)
      return s
    }
    const resolvedGroups = groups.map((g, i) => ({ key: g?.key, name: g?.name, color: g?.color ?? null, position: i }))
    const resolvedFields = fields.map((f, i) => ({
      key: f?.key, name: f?.name, slug: slugField(f?.name), type: f?.type,
      position: typeof f?.position === 'number' ? f.position : i + 1,
      options: Array.isArray(f?.options) ? f.options : [],
      is_default_status: !!f?.is_default_status,
      common_field_key: f?.common_field_key ?? null,
      visible_in_group_keys: Array.isArray(f?.visible_in_groups) ? f.visible_in_groups : [],
      required_in_group_keys: Array.isArray(f?.required_in_groups) ? f.required_in_groups : [],
    }))
    const resolvedChecklist = checklist.map((c) => ({
      key: c?.key, name: c?.name, slug: slugField(c?.name),
      visible_in_group_keys: Array.isArray(c?.visible_in_groups) ? c.visible_in_groups : [],
    }))

    resolvedBoards.push({
      key: bkey, name: board?.name, slug, board_type: board?.board_type ?? 'custom',
      description: board?.description ?? null, position: bi,
      groups: resolvedGroups, fields: resolvedFields, checklist: resolvedChecklist,
    })
  })

  // ── Automations — parsed, always deferred (never created in V1) ──
  const automations = Array.isArray(bp.automations) ? bp.automations : []
  automations.forEach((a, ai) => {
    unsupportedDeferred.push({
      type: 'automation', label: `Automation ${ai + 1}`, path: `$.automations[${ai}]`,
      message: 'Automation creation is deferred until Automation Center exists.', severity: 'deferred',
    })
  })

  const valid = blockingErrors.length === 0
  return {
    valid,
    summary: {
      boards: boards.length,
      groups: groupCount,
      fields: fieldCount,
      checklistFields: checklistCount,
      automationsDeferred: automations.length,
      warnings: warnings.length,
      blockingErrors: blockingErrors.length,
    },
    willCreate,
    warnings,
    blockingErrors,
    unsupportedDeferred,
    commonFieldBindings,
    resolvedBlueprint: { version: bp.version, boards: resolvedBoards },
  }
}
