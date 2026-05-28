// ─────────────────────────────────────────────────────────────────────────
// Twilio REST client — fetch + Basic auth, no 'twilio' package.
// POST /2010-04-01/Accounts/{SID}/Messages.json
// ─────────────────────────────────────────────────────────────────────────

import type { TwilioConfig } from '../types'

export type TwilioSendResult =
  | { ok: true; sid: string; status: string }
  | { ok: false; error: string }

/** Send an SMS via Twilio. Uses MessagingServiceSid if present, else the from number. */
export async function sendTwilioSms(args: {
  config: TwilioConfig
  to: string
  body: string
  statusCallback?: string
}): Promise<TwilioSendResult> {
  const { config, to, body, statusCallback } = args
  if (!config.account_sid || !config.auth_token) return { ok: false, error: 'twilio_not_configured' }

  const form = new URLSearchParams()
  form.set('To', to)
  form.set('Body', body)
  if (config.messaging_service_sid) form.set('MessagingServiceSid', config.messaging_service_sid)
  else if (config.twilio_phone) form.set('From', config.twilio_phone)
  else return { ok: false, error: 'twilio_no_sender' }
  if (statusCallback) form.set('StatusCallback', statusCallback)

  const auth = Buffer.from(`${config.account_sid}:${config.auth_token}`).toString('base64')
  let res: Response
  try {
    res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    })
  } catch {
    return { ok: false, error: 'twilio_request_failed' }
  }

  const data = (await res.json().catch(() => ({}))) as { sid?: string; status?: string; message?: string }
  if (!res.ok || !data.sid) return { ok: false, error: data.message ? `twilio: ${data.message}` : 'twilio_request_failed' }
  return { ok: true, sid: data.sid, status: data.status ?? 'queued' }
}
