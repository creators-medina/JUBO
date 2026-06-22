'use server'

// ─────────────────────────────────────────────────────────────────────────
// Communicate tab context (Phase 36E-1) — READ-only resolver that surfaces the
// EXISTING Phase 26 SMS stack scoped to one record, plus contact identity, the
// record's notes, and org members for @mentions. Sending still goes through the
// existing sendSMS action (real Twilio path) — this only gathers what the tab
// needs to render (connected state, resolved phone/email, thread + messages).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { getTwilioConfig, getThreadForRecord } from '@/features/conversations/queries'
import { loadThreadMessages } from '@/features/conversations/actions'
import type { ConversationMessage } from '@/features/conversations/types'
import type { NoteRow } from '@/features/workspace/types'

export type CommunicateContext = {
  twilioConnected: boolean
  phone: string | null
  email: string | null
  threadId: string | null
  messages: ConversationMessage[]
  notes: NoteRow[]
  members: { id: string; name: string }[]
  currentUserId: string | null
} | null

export async function getCommunicateContext(recordId: string): Promise<CommunicateContext> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: rec } = await supabase
    .from('records').select('organization_id, board_id').eq('id', recordId).maybeSingle()
  if (!rec) return null
  const orgId = (rec as { organization_id: string }).organization_id
  const boardId = (rec as { board_id: string | null }).board_id

  // ── Contact identity: common_field_key (phone/email) first, then a board field
  // of that type (the Add-Record fallback). ──
  const { data: keys } = await supabase
    .from('common_field_keys').select('id, key').eq('organization_id', orgId).in('key', ['phone', 'email'])
  const phoneKeyId = (keys ?? []).find((k: any) => k.key === 'phone')?.id ?? null
  const emailKeyId = (keys ?? []).find((k: any) => k.key === 'email')?.id ?? null

  let phone: string | null = null
  let email: string | null = null
  if (boardId) {
    const { data: fields } = await supabase
      .from('fields').select('id, field_type, common_field_key_id').eq('board_id', boardId)
      .or('field_type.in.(phone,email),common_field_key_id.not.is.null')
    const fl = (fields ?? []) as { id: string; field_type: string; common_field_key_id: string | null }[]
    const fieldIds = fl.map((f) => f.id)
    const valById = new Map<string, string>()
    if (fieldIds.length > 0) {
      const { data: vals } = await supabase
        .from('field_values').select('field_id, value_text').eq('record_id', recordId).in('field_id', fieldIds).not('value_text', 'is', null)
      for (const v of (vals ?? []) as { field_id: string; value_text: string }[]) valById.set(v.field_id, v.value_text)
    }
    const pick = (keyId: string | null, type: string): string | null => {
      if (keyId) { const f = fl.find((x) => x.common_field_key_id === keyId && valById.has(x.id)); if (f) return valById.get(f.id)! }
      const f2 = fl.find((x) => x.field_type === type && valById.has(x.id)); return f2 ? valById.get(f2.id)! : null
    }
    phone = pick(phoneKeyId, 'phone')
    email = pick(emailKeyId, 'email')
  }

  // ── SMS: connected state + the record's thread/messages (reuse Phase 26). ──
  const twilioConnected = !!(await getTwilioConfig(supabase as never, orgId))
  const thread = await getThreadForRecord(recordId)
  const threadId = thread?.id ?? null
  const messages = threadId ? await loadThreadMessages(threadId) : []

  // ── Notes + org members (for @mentions). ──
  const { data: notes } = await supabase
    .from('notes').select('*').eq('record_id', recordId).order('created_at', { ascending: false })

  const { data: mems } = await supabase
    .from('organization_members').select('user_id, status, profiles:user_id(first_name, last_name, email)')
    .eq('organization_id', orgId)
  const members = ((mems ?? []) as any[])
    .filter((m) => m.status !== 'disabled' && m.user_id)
    .map((m) => {
      const p = m.profiles ?? {}
      const name = [p.first_name, p.last_name].filter(Boolean).join(' ').trim() || p.email || 'Member'
      return { id: m.user_id as string, name }
    })

  return { twilioConnected, phone, email, threadId, messages, notes: (notes ?? []) as NoteRow[], members, currentUserId: user.id }
}
