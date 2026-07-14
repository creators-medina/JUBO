// ─────────────────────────────────────────────────────────────────────────
// Lender Theme Day buckets — pure, defensive classifiers over EXISTING data.
//
// There is no tag table in Jubo today, so a contact's theme-day bucket (and
// the category chips shown on the contact card) are DERIVED from data that
// already exists: board name/slug, group (stage) name, and record_type.
// Nothing here writes, and no IDs are hardcoded — matching is by name/slug
// keywords only, so imported boards with custom names still classify.
// A true editable tag model is a future backend phase.
// ─────────────────────────────────────────────────────────────────────────

export type ThemeBucketKey = 'realtors' | 'status' | 'preapps' | 'pastclients' | 'vips'

export type BucketSource = {
  boardSlug?: string | null
  boardName?: string | null
  groupName?: string | null
  recordType?: string | null
}

const has = (v: string | null | undefined, needles: string[]): boolean => {
  if (!v) return false
  const n = v.toLowerCase()
  return needles.some((k) => n.includes(k))
}

const REALTOR_WORDS = ['realtor', 'real estate', 'agent', 'partner', 'referral']
const VIP_WORDS = ['vip', 'favorite', 'favourite', 'influential', 'sphere']
const PAST_WORDS = ['past client', 'past-client', 'past_client', 'pastclient']
const CLOSED_GROUP_WORDS = ['funded', 'closed', 'post closing', 'post-closing']
const PREAPP_WORDS = ['pre-app', 'preapp', 'pre app', 'preapprov', 'pre-approv', 'prequal', 'pre-qual', 'application', 'credit']
const ACTIVE_FILE_BOARD_WORDS = [
  'loan', 'pipeline', 'phase', 'in process', 'in-process', 'underwrit', 'processing',
  'initial consult', 'lead capture', 'escrow', 'submitted', 'condition',
]
const DEAD_GROUP_WORDS = ['lost', 'dead', 'withdrawn', 'denied', 'cancel']

/** Which theme-day buckets a record belongs to (a record can match several). */
export function classifyThemeBuckets(s: BucketSource): ThemeBucketKey[] {
  const out: ThemeBucketKey[] = []
  const boardText = `${s.boardSlug ?? ''} ${s.boardName ?? ''}`

  // Friday — VIPs / favorite people (checked first: a "VIP Partners" board is a VIP list).
  if (has(boardText, VIP_WORDS)) out.push('vips')

  // Monday — Realtors / agents / referral partners.
  if (s.recordType === 'referral' || has(boardText, REALTOR_WORDS)) out.push('realtors')

  // Thursday — past clients (dedicated board, or a file sitting in a funded/closed stage).
  if (has(boardText, PAST_WORDS) || has(s.groupName, CLOSED_GROUP_WORDS)) out.push('pastclients')

  // Wednesday — pre-apps / pre-approvals / applications (stage first, board fallback).
  if (has(s.groupName, PREAPP_WORDS) || has(boardText, PREAPP_WORDS)) out.push('preapps')

  // Tuesday — status calls on ACTIVE files: loan-pipeline-shaped boards whose
  // stage isn't closed/funded or dead. Realtor/VIP/past-client boards excluded.
  if (
    !out.includes('pastclients') && !out.includes('realtors') && !out.includes('vips') &&
    has(boardText, ACTIVE_FILE_BOARD_WORDS) &&
    !has(s.groupName, CLOSED_GROUP_WORDS) && !has(s.groupName, DEAD_GROUP_WORDS)
  ) out.push('status')

  return out
}

/** Display chip per derived category — shown on the contact card and lead rows. */
export type ContactTag = { key: ThemeBucketKey; label: string }

const TAG_LABEL: Record<ThemeBucketKey, string> = {
  realtors: 'Realtor / Agent',
  status: 'Active File',
  preapps: 'Pre-App',
  pastclients: 'Past Client',
  vips: 'VIP',
}

export function deriveContactTags(s: BucketSource): ContactTag[] {
  return classifyThemeBuckets(s).map((key) => ({ key, label: TAG_LABEL[key] }))
}

/** Existing design tokens per bucket (no new colors). */
export const TAG_CHIP_CLASS: Record<ThemeBucketKey, string> = {
  realtors: 'bg-jubo-navy/10 text-jubo-navy',
  status: 'bg-jubo-green-soft text-jubo-green',
  preapps: 'bg-jubo-gold-soft text-jubo-gold',
  pastclients: 'bg-jubo-red/10 text-jubo-red',
  vips: 'bg-jubo-gold-soft text-jubo-gold',
}

/** Best existing board to send the user to when a bucket is empty/low. */
export function findBucketBoard(
  bucket: ThemeBucketKey,
  boards: { id: string; name: string; slug: string | null }[],
): { id: string; name: string } | null {
  const words: Record<ThemeBucketKey, string[]> = {
    realtors: REALTOR_WORDS,
    vips: VIP_WORDS,
    pastclients: [...PAST_WORDS, 'past'],
    preapps: PREAPP_WORDS,
    status: ACTIVE_FILE_BOARD_WORDS,
  }
  const b = boards.find((x) => has(`${x.slug ?? ''} ${x.name}`, words[bucket]))
  return b ? { id: b.id, name: b.name } : null
}
