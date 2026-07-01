#!/usr/bin/env node
/* eslint-disable */
// ───────────────────────────────────────────────────────────────────────────
// Restructure the "Phase 1" board into the "Initial Consult" pipeline.
//
// SAFE BY DEFAULT: runs a DRY RUN (reads only, writes nothing) unless you pass
// --execute. It is NON-DESTRUCTIVE — it never hard-deletes a group and never
// deletes a checklist field; old stages are ARCHIVED after their records move.
//
// What it does (execute mode):
//   1. Rename the board  →  "Initial Consult"
//   2. Reuse-or-create the 4 target stages, set position + role_label + guidance_note
//   3. Ensure each stage's checklist items exist as field_type='checklist' fields
//      (reuse by name if present — preserves progress; else create), visible in the stage
//   4. Carry checklist visibility from source stages onto the mapped target stage
//   5. Move every record from each source stage to its mapped target (append + renumber)
//   6. Repoint workflows whose config references a source group id → target id
//   7. Archive the emptied source stages (is_archived=true)  — never delete
//
// WORKFLOW SUPPRESSION: record moves are done as raw DB updates (records.group_id),
// NOT through the app's moveRecord action, so NO record.group_changed workflows
// fire during the restructure and NO extra record_movements rows are written.
// (Existing movement history is left intact.) Trade-off: a raw group change still
// bumps records.updated_at via the shared trigger — see the report; tell me if you
// need updated_at preserved and I'll add a guarded pass.
//
// USAGE:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
//     node scripts/restructure-initial-consult.cjs                 # dry run
//   ... node scripts/restructure-initial-consult.cjs --execute --yes   # apply
//
// OPTIONS:
//   --board="Phase 1 - Lead Capture & Pre-Qualification"   exact/like name (default: %Phase 1%)
//   --board-id=<uuid>                                       target a specific board id
//   --execute                                               actually write (default: dry run)
//   --yes                                                   skip the confirm prompt in --execute
// ───────────────────────────────────────────────────────────────────────────

const { createClient } = require('@supabase/supabase-js')

// ── args ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => { const a = args.find((x) => x.startsWith(f + '=')); return a ? a.slice(f.length + 1) : undefined }
const EXECUTE = has('--execute')
const SKIP_CONFIRM = has('--yes')
const BOARD_NAME_LIKE = val('--board') || 'Phase 1'
const BOARD_ID = val('--board-id')

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✗ Missing env. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (service role — bypasses RLS).')
  process.exit(1)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })

// ── target pipeline definition (from the spec) ───────────────────────────────
const TARGETS = [
  {
    name: 'Lead Intake', role: 'LO',
    guidance: 'The intro call should be centered around the client. The LO should learn the borrower’s goals, understand their situation, and clearly explain the mortgage process so the borrower knows what to expect.',
    checklist: ['Intro call', 'Send or take ARIVE application', 'Create group text', 'Update and thank referral source'],
  },
  {
    name: 'Welcome & Docs', role: 'LP1',
    guidance: 'The welcome message should be positive, clear, and timely. Communicate urgency around the timeline while making the borrower feel supported and confident about the next steps.',
    checklist: ['Save contact in phone and CRM', 'Request needed documents and send welcome email', 'Follow up in group text'],
  },
  {
    name: 'Document Follow-Up', role: 'LP1',
    guidance: 'Follow up daily for missing documents and reinforce the importance of quick submission so the file can move toward pre-qualification as soon as possible.',
    checklist: ['Log lead in ARIVE', 'Follow up daily'],
  },
  {
    name: 'Review & Pre-Approval', role: 'LO',
    guidance: 'Send a congratulations message in the group text and offer to call the borrower to answer questions, review the pre-approval, and explain next steps.',
    checklist: ['Review documents for accuracy', 'Structure and price the loan', 'Run pre-approval scenarios', 'Select lender', 'Send pre-approval email'],
  },
]

// keyword → target index. A source stage name is matched (case-insensitive
// substring, either direction) against these. Anything that matches NOTHING, or
// matches MORE THAN ONE bucket, is reported and blocks execution (no guessing).
const BUCKETS = [
  { t: 0, keys: ['lead intake', 'lead comes in', 'new lead', 'contacted', 'intro call', 'lead entry', 'lead capture', 'inbound lead'] },
  { t: 1, keys: ['welcome & docs', 'welcome and docs', 'gather info', 'request docs', 'send welcome email', 'application sent', 'application started', 'welcome email', 'application'] },
  { t: 2, keys: ['document follow-up', 'document follow up', 'follow up', 'follow-up', 'missing docs', 'waiting on docs', 'document collection', 'request outstanding docs'] },
  { t: 3, keys: ['review & pre-approval', 'review and pre-approval', 'pre-approval', 'pre approval', 'preapproved', 'review', 'processing', 'structure loan', 'pricing', 'select lender'] },
]

const norm = (s) => (s || '').trim().toLowerCase()
function classify(name) {
  const n = norm(name)
  const hits = []
  for (const b of BUCKETS) {
    if (b.keys.some((k) => n === k || n.includes(k) || k.includes(n))) hits.push(b.t)
  }
  const uniq = [...new Set(hits)]
  if (uniq.length === 1) return { target: uniq[0], matched: true }
  if (uniq.length === 0) return { target: null, matched: false, reason: 'no bucket matched' }
  return { target: null, matched: false, reason: `ambiguous — matches stages ${uniq.map((i) => i + 1).join(', ')}` }
}

const slugify = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'field'
const die = (msg) => { console.error('\n✗ ' + msg); process.exit(1) }
const money = (n) => (n ? '$' + Number(n).toLocaleString() : '$0')

async function main() {
  console.log('\n' + '═'.repeat(74))
  console.log(EXECUTE ? '  INITIAL CONSULT RESTRUCTURE — EXECUTE MODE (will write)' : '  INITIAL CONSULT RESTRUCTURE — DRY RUN (no changes written)')
  console.log('═'.repeat(74))

  // ── prerequisite: migration columns present ────────────────────────────────
  {
    const { error } = await db.from('board_groups').select('id, role_label, guidance_note').limit(1)
    if (error) {
      if (/role_label|guidance_note|column/.test(error.message)) {
        die('Migration NOT applied: board_groups.role_label / guidance_note are missing.\n' +
            '   Apply 20260630000000_phase5j_stage_role_and_guidance.sql first, e.g.\n' +
            '     supabase db push       (or run the file in the Supabase SQL editor)\n' +
            '   then re-run this script.')
      }
      die('Could not read board_groups: ' + error.message)
    }
  }
  console.log('✓ Prerequisite: board_groups.role_label / guidance_note present.')

  // ── resolve the board ──────────────────────────────────────────────────────
  let board
  if (BOARD_ID) {
    const { data, error } = await db.from('boards').select('*').eq('id', BOARD_ID).maybeSingle()
    if (error || !data) die('Board id not found: ' + BOARD_ID)
    board = data
  } else {
    const { data, error } = await db.from('boards').select('*').ilike('name', `%${BOARD_NAME_LIKE}%`).eq('is_archived', false)
    if (error) die('Board lookup failed: ' + error.message)
    if (!data || data.length === 0) die(`No board matches name like "%${BOARD_NAME_LIKE}%". Pass --board="..." or --board-id=...`)
    if (data.length > 1) {
      console.error('\n✗ Multiple boards match — disambiguate with --board-id=<uuid>:')
      data.forEach((b) => console.error(`   • ${b.id}  "${b.name}"  (org ${b.organization_id})`))
      process.exit(1)
    }
    board = data[0]
  }
  const orgId = board.organization_id
  console.log(`\nBOARD: ${board.id}\n  name: "${board.name}"  →  "Initial Consult"\n  org:  ${orgId}`)

  // ── load groups, records, checklist fields, workflows ──────────────────────
  const { data: groups } = await db.from('board_groups').select('*').eq('board_id', board.id).order('position', { ascending: true })
  const active = groups.filter((g) => !g.is_archived)
  const archived = groups.filter((g) => g.is_archived)

  const { data: recs } = await db.from('records').select('id, group_id, value, is_archived, position, created_at').eq('board_id', board.id)
  const byGroup = {}
  for (const g of groups) byGroup[g.id] = { count: 0, value: 0, archivedCount: 0, ids: [] }
  const noGroup = { count: 0 }
  for (const r of recs) {
    if (!r.group_id || !byGroup[r.group_id]) { noGroup.count++; continue }
    const b = byGroup[r.group_id]
    b.count++; b.value += Number(r.value) || 0; if (r.is_archived) b.archivedCount++
    b.ids.push(r)
  }

  const { data: fields } = await db.from('fields').select('id, name, field_type, slug, position').eq('board_id', board.id)
  const checklistFields = (fields || []).filter((f) => f.field_type === 'checklist')
  const { data: vis } = await db.from('field_group_visibility').select('field_id, group_id').eq('organization_id', orgId)
  const visByField = {}
  for (const v of vis || []) (visByField[v.field_id] = visByField[v.field_id] || new Set()).add(v.group_id)
  const groupIdSet = new Set(groups.map((g) => g.id))

  const { data: workflows } = await db.from('workflows').select('id, title, enabled, board_id, config').eq('organization_id', orgId)
  const wfRefs = [] // { wf, refs:[{path, groupId}] }
  for (const wf of workflows || []) {
    const cfg = wf.config || {}
    const refs = []
    const a = cfg.action || {}, c = cfg.condition || {}
    if (a.groupId && groupIdSet.has(a.groupId)) refs.push({ path: 'action.groupId', groupId: a.groupId })
    if (c.sourceGroupId && groupIdSet.has(c.sourceGroupId)) refs.push({ path: 'condition.sourceGroupId', groupId: c.sourceGroupId })
    if (refs.length) wfRefs.push({ wf, refs })
  }

  // ── build the mapping ──────────────────────────────────────────────────────
  // A target is REUSED if an active group already has that exact name; otherwise
  // it will be created. Remaining active groups are SOURCES mapped by keyword.
  const targetGroupFor = new Array(4).fill(null) // existing group reused as target i
  for (let i = 0; i < 4; i++) {
    const exact = active.find((g) => norm(g.name) === norm(TARGETS[i].name))
    if (exact) targetGroupFor[i] = exact
  }
  const reusedIds = new Set(targetGroupFor.filter(Boolean).map((g) => g.id))

  const plan = { moves: [], unresolved: [], sources: [] }
  for (const g of active) {
    if (reusedIds.has(g.id)) continue // it's a destination, not a source
    const cls = classify(g.name)
    if (!cls.matched) { plan.unresolved.push({ group: g, reason: cls.reason }); continue }
    plan.sources.push({ group: g, target: cls.target })
    plan.moves.push({ from: g, target: cls.target, count: byGroup[g.id].count })
  }

  // ── DRY-RUN REPORT ─────────────────────────────────────────────────────────
  console.log('\n── CURRENT ACTIVE STAGES ' + '─'.repeat(48))
  active.forEach((g) => {
    const b = byGroup[g.id]
    const cl = checklistFields.filter((f) => (visByField[f.id]?.has(g.id)) || !visByField[f.id]).map((f) => f.name)
    console.log(`  • "${g.name}"  [${g.id.slice(0, 8)}]  ${b.count} records (${b.archivedCount} archived) · ${money(b.value)}`)
    if (cl.length) console.log(`      checklist visible: ${cl.join(', ')}`)
  })
  if (archived.length) {
    console.log('\n── ALREADY-ARCHIVED STAGES ' + '─'.repeat(46))
    archived.forEach((g) => console.log(`  • "${g.name}" [${g.id.slice(0, 8)}]  ${byGroup[g.id].count} records`))
  }
  if (noGroup.count) console.log(`\n  ⚠ ${noGroup.count} record(s) already have NO group (orphaned) on this board — left untouched.`)

  console.log('\n── FINAL 4 STAGES (target) ' + '─'.repeat(46))
  TARGETS.forEach((t, i) => {
    const g = targetGroupFor[i]
    console.log(`  ${i + 1}. "${t.name}"  [${t.role}]  ${g ? `reuse ${g.id.slice(0, 8)}` : 'CREATE new'}`)
    console.log(`      checklist: ${t.checklist.join(' · ')}`)
  })

  console.log('\n── RECORD MOVES (source → target) ' + '─'.repeat(39))
  if (!plan.moves.length) console.log('  (none — all active stages are already the targets)')
  plan.moves.forEach((m) => console.log(`  • "${m.from.name}" → ${m.target + 1}. ${TARGETS[m.target].name}   (${m.count} records)`))

  // checklist reuse / duplicate detection
  const wantNames = new Set(TARGETS.flatMap((t) => t.checklist.map(norm)))
  const dupByName = {}
  for (const f of checklistFields) (dupByName[norm(f.name)] = dupByName[norm(f.name)] || []).push(f)
  const dups = Object.entries(dupByName).filter(([, arr]) => arr.length > 1)
  console.log('\n── CHECKLIST FIELDS ' + '─'.repeat(53))
  TARGETS.forEach((t) => t.checklist.forEach((item) => {
    const existing = checklistFields.find((f) => norm(f.name) === norm(item))
    console.log(`  • "${item}" → ${existing ? `REUSE existing field [${existing.id.slice(0, 8)}] (progress preserved)` : 'CREATE new checklist field'}`)
  }))
  if (dups.length) {
    console.log('\n  ⚠ DUPLICATE checklist fields (same name, >1 field) — NOT merged automatically:')
    dups.forEach(([n, arr]) => console.log(`      "${n}": ${arr.map((f) => f.id.slice(0, 8)).join(', ')}  → review/merge manually`))
  }

  console.log('\n── WORKFLOWS REFERENCING THESE STAGES ' + '─'.repeat(35))
  if (!wfRefs.length) console.log('  (none)')
  wfRefs.forEach(({ wf, refs }) => {
    refs.forEach((r) => {
      const src = plan.sources.find((s) => s.group.id === r.groupId)
      const reused = reusedIds.has(r.groupId)
      const dest = src ? `→ ${TARGETS[src.target].name}` : reused ? '(already a target — unchanged)' : '⚠ maps to unresolved stage — will REPORT, not change'
      console.log(`  • "${wf.title}" ${wf.enabled ? '' : '(disabled) '}${r.path} ${dest}`)
    })
  })

  // risks / blockers
  console.log('\n── RISKS / NOTES ' + '─'.repeat(56))
  console.log('  • Record moves are raw DB updates → NO workflows fire, NO new movement rows.')
  console.log('  • Raw group change still bumps records.updated_at (recency). Ask to preserve if needed.')
  if (dups.length) console.log('  • Duplicate checklist fields present — carried, not merged (manual OR-merge advised).')
  if (plan.unresolved.length) {
    console.log('\n  ✗ UNRESOLVED STAGES (block execution — no guessing):')
    plan.unresolved.forEach((u) => console.log(`      "${u.group.name}" [${u.group.id.slice(0, 8)}] — ${u.reason}`))
  }

  if (!EXECUTE) {
    console.log('\n' + '═'.repeat(74))
    console.log('  DRY RUN complete. No changes written.')
    if (plan.unresolved.length) console.log('  Resolve the unresolved stage mapping(s) above before executing.')
    console.log('  Re-run with  --execute --yes  to apply.')
    console.log('═'.repeat(74) + '\n')
    return
  }

  // ── EXECUTE ────────────────────────────────────────────────────────────────
  if (plan.unresolved.length) die('Refusing to execute: unresolved stage mappings above. Rename/clarify them or extend BUCKETS, then re-run.')
  if (!SKIP_CONFIRM) die('Add --yes to confirm execution (re-run: --execute --yes).')

  console.log('\n▶ EXECUTING (non-transactional; non-destructive; stops on first error)…')

  // 1) rename board
  await must(db.from('boards').update({ name: 'Initial Consult' }).eq('id', board.id), 'rename board')
  console.log('  ✓ board renamed → "Initial Consult"')

  // 2) resolve/create the 4 targets, set position + role + guidance
  const targetIds = []
  for (let i = 0; i < 4; i++) {
    const t = TARGETS[i]
    let g = targetGroupFor[i]
    if (!g) {
      const { data, error } = await db.from('board_groups')
        .insert({ board_id: board.id, name: t.name, position: i, role_label: t.role, guidance_note: t.guidance, is_archived: false })
        .select('*').single()
      if (error) die(`create stage "${t.name}": ${error.message}`)
      g = data; console.log(`  ✓ created stage ${i + 1} "${t.name}"`)
    } else {
      await must(db.from('board_groups').update({ position: i, role_label: t.role, guidance_note: t.guidance, is_archived: false }).eq('id', g.id), `update stage "${t.name}"`)
      console.log(`  ✓ reused stage ${i + 1} "${t.name}" (role + guidance set)`)
    }
    targetIds[i] = g.id
  }

  // slug bookkeeping for new fields
  const usedSlugs = new Set((fields || []).map((f) => f.slug))
  let maxFieldPos = Math.max(0, ...(fields || []).map((f) => f.position || 0))
  const uniqueSlug = (base) => { let s = base, n = 2; while (usedSlugs.has(s)) s = `${base}-${n++}`; usedSlugs.add(s); return s }

  // 3) ensure each target's checklist fields exist + visible on the target
  for (let i = 0; i < 4; i++) {
    for (const item of TARGETS[i].checklist) {
      let f = checklistFields.find((x) => norm(x.name) === norm(item))
      if (!f) {
        const { data, error } = await db.from('fields')
          .insert({ organization_id: orgId, board_id: board.id, entity_type: 'record', name: item, slug: uniqueSlug(slugify(item)), field_type: 'checklist', position: ++maxFieldPos, config: {} })
          .select('id, name, field_type, slug, position').single()
        if (error) die(`create checklist field "${item}": ${error.message}`)
        f = data; checklistFields.push(f); console.log(`  ✓ created checklist field "${item}"`)
      }
      await ensureVisible(f.id, targetIds[i], orgId)
    }
  }

  // 4) carry visibility from each source onto its mapped target (stage-specific checklists)
  for (const s of plan.sources) {
    const destGroup = targetIds[s.target]
    for (const f of checklistFields) {
      if (visByField[f.id]?.has(s.group.id)) await ensureVisible(f.id, destGroup, orgId)
    }
  }
  console.log('  ✓ checklist visibility carried to targets')

  // 5) move records (raw update → no workflow, no movement row), then renumber
  //    destination positions. Query fresh dest counts to append after existing.
  const destBase = {}
  for (let i = 0; i < 4; i++) {
    const { count } = await db.from('records').select('id', { count: 'exact', head: true }).eq('group_id', targetIds[i])
    destBase[i] = count || 0
  }
  let movedTotal = 0
  for (const s of plan.sources) {
    const rows = byGroup[s.group.id].ids
    let pos = destBase[s.target]
    for (const r of rows) {
      await must(db.from('records').update({ group_id: targetIds[s.target], position: pos++ }).eq('id', r.id), `move record ${r.id}`)
      movedTotal++
    }
    destBase[s.target] = pos
  }
  console.log(`  ✓ moved ${movedTotal} record(s) to target stages`)

  // renormalize each target's positions 0..n by created_at (stable)
  for (let i = 0; i < 4; i++) {
    const { data: rows } = await db.from('records').select('id').eq('group_id', targetIds[i]).order('created_at', { ascending: true })
    for (let p = 0; p < (rows || []).length; p++) await db.from('records').update({ position: p }).eq('id', rows[p].id)
  }
  console.log('  ✓ renormalized destination positions')

  // 6) repoint workflows (obvious source→target only)
  for (const { wf, refs } of wfRefs) {
    const cfg = JSON.parse(JSON.stringify(wf.config || {}))
    let changed = false
    for (const r of refs) {
      const src = plan.sources.find((s) => s.group.id === r.groupId)
      if (!src) continue // reused target or unresolved → leave as-is (reported)
      const destId = targetIds[src.target]
      if (r.path === 'action.groupId') { cfg.action.groupId = destId; changed = true }
      if (r.path === 'condition.sourceGroupId') { cfg.condition.sourceGroupId = destId; changed = true }
    }
    if (changed) { await must(db.from('workflows').update({ config: cfg }).eq('id', wf.id), `repoint workflow ${wf.id}`); console.log(`  ✓ repointed workflow "${wf.title}"`) }
  }

  // 7) archive emptied sources (verify empty first — safety)
  for (const s of plan.sources) {
    const { count } = await db.from('records').select('id', { count: 'exact', head: true }).eq('group_id', s.group.id)
    if ((count || 0) > 0) { console.log(`  ⚠ skip archive "${s.group.name}" — still has ${count} records`); continue }
    await must(db.from('board_groups').update({ is_archived: true }).eq('id', s.group.id), `archive "${s.group.name}"`)
    console.log(`  ✓ archived source stage "${s.group.name}"`)
  }

  // ── post-exec verification ─────────────────────────────────────────────────
  const { data: finalGroups } = await db.from('board_groups').select('name, position, role_label, is_archived').eq('board_id', board.id).eq('is_archived', false).order('position')
  const { data: finalBoard } = await db.from('boards').select('name').eq('id', board.id).single()
  console.log('\n── VERIFICATION ' + '─'.repeat(57))
  console.log(`  board name: "${finalBoard.name}"`)
  console.log(`  active stages (${finalGroups.length}):`)
  finalGroups.forEach((g) => console.log(`    ${g.position + 1}. ${g.name} [${g.role_label || '—'}]`))
  console.log('\n' + '═'.repeat(74))
  console.log(finalGroups.length === 4 ? '  ✓ DONE — 4 active stages.' : `  ⚠ DONE but ${finalGroups.length} active stages (expected 4) — review above.`)
  console.log('═'.repeat(74) + '\n')

  async function ensureVisible(fieldId, groupId, organization_id) {
    const { error } = await db.from('field_group_visibility').upsert(
      { field_id: fieldId, group_id: groupId, organization_id },
      { onConflict: 'field_id,group_id', ignoreDuplicates: true },
    )
    if (error && !/duplicate|conflict/i.test(error.message)) die(`visibility (${fieldId}→${groupId}): ${error.message}`)
  }
}

async function must(promise, label) {
  const { error } = await promise
  if (error) die(`${label}: ${error.message}`)
}

main().catch((e) => die(e && e.message ? e.message : String(e)))
