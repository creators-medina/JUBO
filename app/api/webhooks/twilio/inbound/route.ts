import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import { validateTwilioSignature } from '@/features/conversations/twilio/signature'
import { recordSmsMessage } from '@/features/conversations/sms/logSMS'
import { findOrgByTwilioNumber, matchRecordByPhone } from '@/features/conversations/queries'
import { isOptOutMessage } from '@/features/conversations/types'

const TWIML_OK = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const xml = (status = 200) => new NextResponse(TWIML_OK, { status, headers: { 'Content-Type': 'text/xml' } })

/** Inbound Twilio SMS. Signature-validated, idempotent, writes to the unified layer. */
export async function POST(req: NextRequest) {
  if (!hasAdminCredentials()) return NextResponse.json({ error: 'admin_unavailable' }, { status: 503 })

  const raw = await req.text()
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v

  const from = params.From
  const to = params.To
  const messageSid = params.MessageSid
  const body = params.Body ?? ''
  if (!from || !to || !messageSid) return xml() // malformed — ack so Twilio doesn't retry forever

  const admin = createAdminClient() as unknown as SupabaseClient

  // Identify the org by the inbound Twilio number, then validate the signature
  // with THAT org's auth token (Twilio signs with the account auth token).
  const match = await findOrgByTwilioNumber(admin, to)
  if (!match) return xml() // unknown number — ack, nothing to do
  const { organizationId, config } = match
  if (config.inbound_enabled === false) return xml()

  const proto = req.headers.get('x-forwarded-proto') ?? 'https'
  const host = req.headers.get('host') ?? ''
  const url = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`
  const valid = validateTwilioSignature({ signature: req.headers.get('x-twilio-signature'), url, params, authToken: config.auth_token })
  if (!valid) return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })

  // Opt-out compliance (record the message either way).
  const optOut = isOptOutMessage(body)
  if (optOut.optOut) {
    await admin.from('opt_out_suppressions')
      .upsert({ organization_id: organizationId, phone: from, reason: optOut.keyword ?? 'STOP' }, { onConflict: 'organization_id,phone' })
  }

  // Match to a record (org-wide phone scan), then write idempotently.
  const recordMatch = await matchRecordByPhone(admin, organizationId, from)
  const result = await recordSmsMessage(admin, {
    organizationId,
    recordId: recordMatch?.recordId ?? null,
    participantPhone: from,
    participantName: recordMatch?.name ?? null,
    direction: 'inbound',
    body,
    userId: null,
    twilioMessageSid: messageSid,
    deliveryStatus: 'received',
  })
  if (result.duplicate) return xml() // replay — already processed

  // Workflows (headless, best-effort). Only when matched to a record.
  if (recordMatch?.recordId) {
    try {
      await dispatchWorkflowEvent(
        { type: 'sms.received', organizationId, recordId: recordMatch.recordId, threadId: result.threadId, commChannel: 'sms', commDirection: 'inbound', commOutcome: 'received', participantPhone: from, unreadCount: result.unreadCount },
        { client: admin as unknown as SupabaseClient, userId: null },
      )
      if (result.unreadCount >= 2) {
        await dispatchWorkflowEvent(
          { type: 'conversation.unread', organizationId, recordId: recordMatch.recordId, threadId: result.threadId, participantPhone: from, unreadCount: result.unreadCount },
          { client: admin as unknown as SupabaseClient, userId: null },
        )
      }
    } catch { /* best-effort */ }
  }

  return xml()
}
