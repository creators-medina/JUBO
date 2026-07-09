// ─────────────────────────────────────────────────────────────────────────
// Phase B — Resend send client. Raw HTTP (no npm SDK), mirroring
// features/conversations/twilio/client.ts. Server-only (uses the secret key).
// ─────────────────────────────────────────────────────────────────────────

import type { EmailConfig } from './types'

export type EmailSendResult = { ok: true; id: string } | { ok: false; error: string }

export async function sendResendEmail(args: {
  config: EmailConfig
  to: string
  subject: string
  text: string
}): Promise<EmailSendResult> {
  const { config, to, subject, text } = args
  if (!config.api_key || !config.from_email) return { ok: false, error: 'email_not_configured' }

  const from = config.from_name ? `${config.from_name} <${config.from_email}>` : config.from_email

  let res: Response
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.api_key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, text }),
    })
  } catch {
    return { ok: false, error: 'email_request_failed' }
  }

  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string }
  if (!res.ok || !data.id) {
    return { ok: false, error: data.message ? `resend: ${data.message}` : 'email_request_failed' }
  }
  return { ok: true, id: data.id }
}
