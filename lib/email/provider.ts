// ─────────────────────────────────────────────────────────────────────────
// Transactional email — provider-agnostic seam. Jubo has no email provider
// today, so this is INERT unless two OPTIONAL env vars are set:
//   RESEND_API_KEY  — a Resend API key (https://resend.com; raw HTTP, no SDK)
//   EMAIL_FROM      — the verified From address, e.g. "Jubo <team@yourdomain>"
// When either is missing, sendEmail is a no-op that reports `not_configured`,
// so callers fall back to the existing copy-link flow — nothing crashes and no
// env var is REQUIRED. Swapping providers means changing only the fetch below.
//
// This module never logs message bodies, recipients, or links.
// ─────────────────────────────────────────────────────────────────────────

export type SendEmailInput = {
  to: string
  subject: string
  html: string
  text: string
  replyTo?: string
}

export type SendEmailResult =
  | { sent: true; id?: string }
  | { sent: false; reason: 'not_configured' | 'invalid_input' | 'send_failed' }

/** True when a provider is configured (both env vars present). */
export function isEmailConfigured(): boolean {
  return !!(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

/** Send one transactional email. Never throws; returns a result the caller can branch on. */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.EMAIL_FROM
  if (!apiKey || !from) return { sent: false, reason: 'not_configured' }
  if (!input.to || !input.subject || !input.html) return { sent: false, reason: 'invalid_input' }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(input.replyTo ? { reply_to: input.replyTo } : {}),
      }),
    })
    if (!res.ok) return { sent: false, reason: 'send_failed' }
    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { sent: true, id: data.id }
  } catch {
    return { sent: false, reason: 'send_failed' }
  }
}
