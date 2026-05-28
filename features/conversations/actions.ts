'use server'

import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import { sendTwilioSms } from './twilio/client'
import { recordSmsMessage } from './sms/logSMS'
import { getTwilioConfig, getThreadMessages, isPhoneOptedOut } from './queries'
import { normalizePhoneDigits, type ConversationMessage, type TwilioConfig } from './types'

/** Load a thread's messages (used by the conversations client on thread select). */
export async function loadThreadMessages(threadId: string): Promise<ConversationMessage[]> {
  await requireUserOrg()
  return getThreadMessages(threadId)
}

async function requireUserOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: m } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!m) throw new Error('No organization')
  return { supabase, user, orgId: (m as { organization_id: string }).organization_id }
}

function statusCallbackUrl(): string | undefined {
  const base = process.env.NEXT_PUBLIC_SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  return base ? `${base}/api/webhooks/twilio/status` : undefined
}

async function resolveRecordPhone(supabase: SupabaseClient, recordId: string): Promise<string | null> {
  const { data: fields } = await supabase.from('fields').select('id').eq('field_type', 'phone')
  const ids = ((fields as { id: string }[] | null) ?? []).map((f) => f.id)
  if (ids.length === 0) return null
  const { data: v } = await supabase
    .from('field_values').select('value_text').eq('record_id', recordId).in('field_id', ids).not('value_text', 'is', null).limit(1).maybeSingle()
  return (v as { value_text: string } | null)?.value_text ?? null
}

export type SendSmsResult = { ok: true; threadId: string; messageId: string } | { error: string }

/** Send an outbound SMS. Pass a threadId, or (recordId and/or toPhone). */
export async function sendSMS(input: { threadId?: string | null; recordId?: string | null; toPhone?: string | null; body: string }): Promise<SendSmsResult> {
  const body = (input.body ?? '').trim()
  if (!body) return { error: 'empty_message' }

  const { supabase, user, orgId } = await requireUserOrg()

  // Resolve participant phone + record from the thread or inputs.
  let phone = input.toPhone ?? null
  let recordId = input.recordId ?? null
  if (input.threadId) {
    const { data: thread } = await supabase
      .from('conversation_threads').select('participant_phone, primary_record_id').eq('id', input.threadId).maybeSingle()
    if (!thread) return { error: 'thread_not_found' }
    phone = (thread as { participant_phone: string }).participant_phone
    recordId = recordId ?? (thread as { primary_record_id: string | null }).primary_record_id
  }
  if (!phone && recordId) phone = await resolveRecordPhone(supabase, recordId)
  if (!phone || normalizePhoneDigits(phone).length < 7) return { error: 'no_phone' }

  // Compliance: never send to an opted-out number.
  if (await isPhoneOptedOut(supabase as never, orgId, phone)) return { error: 'phone_opted_out' }

  const config: TwilioConfig | null = await getTwilioConfig(supabase as never, orgId)
  if (!config) return { error: 'twilio_not_configured' }
  if (config.outbound_enabled === false) return { error: 'outbound_disabled' }

  const sent = await sendTwilioSms({ config, to: phone, body, statusCallback: statusCallbackUrl() })
  if (!sent.ok) return { error: sent.error }

  const rec = await recordSmsMessage(supabase as never, {
    organizationId: orgId, recordId, participantPhone: phone, direction: 'outbound',
    body, userId: user.id, twilioMessageSid: sent.sid, deliveryStatus: sent.status,
  })

  // Best-effort workflow dispatch (sms.sent).
  if (recordId) {
    try {
      await dispatchWorkflowEvent(
        { type: 'sms.sent', organizationId: orgId, recordId, threadId: rec.threadId, commChannel: 'sms', commDirection: 'outbound', commOutcome: 'sent', participantPhone: phone },
        { client: supabase as unknown as SupabaseClient, userId: user.id },
      )
    } catch { /* best-effort */ }
  }

  revalidatePath('/conversations')
  revalidatePath('/today')
  return { ok: true, threadId: rec.threadId, messageId: sent.sid }
}

export async function markThreadRead(threadId: string): Promise<{ ok: true } | { error: string }> {
  const { supabase } = await requireUserOrg()
  const { error } = await supabase.from('conversation_threads').update({ unread_count: 0 }).eq('id', threadId)
  if (error) return { error: error.message }
  revalidatePath('/conversations')
  return { ok: true }
}

export async function archiveThread(threadId: string, archived = true): Promise<{ ok: true } | { error: string }> {
  const { supabase } = await requireUserOrg()
  const { error } = await supabase.from('conversation_threads').update({ archived_at: archived ? new Date().toISOString() : null }).eq('id', threadId)
  if (error) return { error: error.message }
  revalidatePath('/conversations')
  return { ok: true }
}

/** Save / update the org's Twilio connection (secrets server-side only). */
export async function saveTwilioConnection(config: TwilioConfig): Promise<{ ok: true } | { error: string }> {
  const { supabase, orgId } = await requireUserOrg()
  if (!config.account_sid) return { error: 'missing_credentials' }

  const { data: existing } = await supabase
    .from('integration_connections').select('id, config').eq('organization_id', orgId).eq('provider', 'twilio').limit(1).maybeSingle()

  // Preserve the stored token when the form leaves it blank (never sent to client).
  const existingToken = (existing as { config?: { auth_token?: string } } | null)?.config?.auth_token
  const authToken = config.auth_token?.trim() || existingToken
  if (!authToken) return { error: 'missing_credentials' }

  const payload = {
    config: {
      account_sid: config.account_sid.trim(),
      auth_token: authToken,
      messaging_service_sid: config.messaging_service_sid?.trim() || null,
      twilio_phone: config.twilio_phone?.trim() || null,
      inbound_enabled: config.inbound_enabled !== false,
      outbound_enabled: config.outbound_enabled !== false,
    },
    status: 'active',
  }

  const { error } = existing
    ? await supabase.from('integration_connections').update(payload).eq('id', (existing as { id: string }).id)
    : await supabase.from('integration_connections').insert({ organization_id: orgId, provider: 'twilio', ...payload })
  if (error) return { error: error.message }
  revalidatePath('/settings/communications')
  return { ok: true }
}
