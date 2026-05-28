import { NextResponse, type NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { dispatchWorkflowEvent } from '@/features/workflows/engine/dispatch'
import { validateTwilioSignature } from '@/features/conversations/twilio/signature'
import { getTwilioConfig } from '@/features/conversations/queries'

/** Twilio delivery-status callback. Updates the message's delivery_status. */
export async function POST(req: NextRequest) {
  if (!hasAdminCredentials()) return NextResponse.json({ error: 'admin_unavailable' }, { status: 503 })

  const raw = await req.text()
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v

  const messageSid = params.MessageSid
  const status = params.MessageStatus || params.SmsStatus
  if (!messageSid || !status) return new NextResponse(null, { status: 204 })

  const admin = createAdminClient() as unknown as SupabaseClient

  // Find the message we wrote when sending, then validate the signature with its org's token.
  const { data: log } = await admin
    .from('communication_logs')
    .select('id, organization_id, record_id, thread_id, metadata')
    .eq('metadata->>twilio_message_sid', messageSid)
    .limit(1)
    .maybeSingle()
  if (!log) return new NextResponse(null, { status: 204 })

  const row = log as { id: string; organization_id: string; record_id: string | null; thread_id: string | null; metadata: Record<string, unknown> }
  const config = await getTwilioConfig(admin, row.organization_id)
  if (config) {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const host = req.headers.get('host') ?? ''
    const url = `${proto}://${host}${req.nextUrl.pathname}${req.nextUrl.search}`
    const valid = validateTwilioSignature({ signature: req.headers.get('x-twilio-signature'), url, params, authToken: config.auth_token })
    if (!valid) return NextResponse.json({ error: 'invalid_signature' }, { status: 403 })
  }

  await admin
    .from('communication_logs')
    .update({ metadata: { ...row.metadata, delivery_status: status, error: params.ErrorCode ?? null } })
    .eq('id', row.id)

  if ((status === 'failed' || status === 'undelivered') && row.record_id) {
    try {
      await dispatchWorkflowEvent(
        { type: 'sms.failed', organizationId: row.organization_id, recordId: row.record_id, threadId: row.thread_id, commChannel: 'sms', commDirection: 'outbound', commOutcome: 'failed' },
        { client: admin as unknown as SupabaseClient, userId: null },
      )
    } catch { /* best-effort */ }
  }

  return new NextResponse(null, { status: 204 })
}
