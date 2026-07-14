'use server'

// ─────────────────────────────────────────────────────────────────────────
// Phase B — Email actions. sendEmail sends a REAL email via Resend, then logs
// it through the existing logCommunication pipeline (so it lands in
// communication_logs → timeline activity → follow-up/next-action → workflows,
// exactly like a manually-logged email but with a real send in front).
// saveEmailConnection stores the Resend creds (secret server-side only).
// ─────────────────────────────────────────────────────────────────────────

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendResendEmail } from './client'
import { getEmailConfig } from './queries'
import { logCommunication } from '../actions'

async function requireUserOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: m } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!m) throw new Error('No organization')
  return { supabase, user, orgId: (m as { organization_id: string }).organization_id }
}

async function resolveRecordEmail(supabase: SupabaseClient, recordId: string): Promise<string | null> {
  const { data: fields } = await supabase.from('fields').select('id').eq('field_type', 'email')
  const ids = ((fields as { id: string }[] | null) ?? []).map((f) => f.id)
  if (ids.length === 0) return null
  const { data: v } = await supabase
    .from('field_values').select('value_text').eq('record_id', recordId).in('field_id', ids).not('value_text', 'is', null).limit(1).maybeSingle()
  return (v as { value_text: string } | null)?.value_text ?? null
}

export type SendEmailResult = { ok: true; id: string; logged: boolean } | { error: string }

/** Send an outbound email to a record's contact. Pass toEmail, or it resolves from the record. */
export async function sendEmail(input: {
  recordId: string
  toEmail?: string | null
  subject: string
  body: string
}): Promise<SendEmailResult> {
  const subject = (input.subject ?? '').trim()
  const body = (input.body ?? '').trim()
  if (!subject) return { error: 'empty_subject' }
  if (!body) return { error: 'empty_body' }

  const { supabase, orgId } = await requireUserOrg()

  // Verify record access (RLS also enforces).
  const { data: record } = await supabase
    .from('records').select('id').eq('id', input.recordId).maybeSingle()
  if (!record) return { error: 'record_not_found' }

  let to = input.toEmail?.trim() || null
  if (!to) to = await resolveRecordEmail(supabase as never, input.recordId)
  if (!to || !to.includes('@')) return { error: 'no_email' }

  const config = await getEmailConfig(supabase as never, orgId)
  if (!config) return { error: 'email_not_configured' }

  const sent = await sendResendEmail({ config, to, subject, text: body })
  if (!sent.ok) return { error: sent.error }

  // The email is out; logging is best-effort. If it fails we still report success
  // (don't imply the send failed) but flag that the timeline entry didn't write.
  const logged = await logCommunication({
    recordId: input.recordId, channel: 'email', direction: 'outbound', subject, body,
  })

  revalidatePath('/today')
  revalidatePath('/dashboard')
  return { ok: true, id: sent.id, logged: !('error' in logged) }
}

export type EmailConnectionInput = {
  api_key: string
  from_email: string
  from_name: string
  enabled: boolean
}

/** Save / update the org's Resend connection (secret key server-side only). */
export async function saveEmailConnection(input: EmailConnectionInput): Promise<{ ok: true } | { error: string }> {
  const { supabase, orgId } = await requireUserOrg()
  const fromEmail = input.from_email?.trim()
  if (!fromEmail || !fromEmail.includes('@')) return { error: 'missing_from_email' }

  const { data: existing } = await supabase
    .from('integration_connections').select('id, config').eq('organization_id', orgId).eq('provider', 'resend').limit(1).maybeSingle()

  // Preserve the stored key when the form leaves it blank (never sent to client).
  const existingKey = (existing as { config?: { api_key?: string } } | null)?.config?.api_key
  const apiKey = input.api_key?.trim() || existingKey
  if (!apiKey) return { error: 'missing_api_key' }

  const payload = {
    config: {
      api_key: apiKey,
      from_email: fromEmail,
      from_name: input.from_name?.trim() || null,
      enabled: input.enabled !== false,
    },
    status: 'active',
  }

  const { error } = existing
    ? await supabase.from('integration_connections').update(payload).eq('id', (existing as { id: string }).id)
    : await supabase.from('integration_connections').insert({ organization_id: orgId, provider: 'resend', ...payload })
  if (error) return { error: error.message }
  revalidatePath('/settings/communications')
  return { ok: true }
}
