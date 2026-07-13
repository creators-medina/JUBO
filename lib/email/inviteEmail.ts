// ─────────────────────────────────────────────────────────────────────────
// Invite email template — pure, no side effects. Renders the HTML + plain-text
// bodies for a team invitation. Carries ONLY invite context (org name, inviter
// name, role, accept link, expiry) — never any CRM/contact/loan data. The
// accept link contains the single-use token and is sent only to the invited
// address; acceptance still requires the recipient to sign in with that email.
// ─────────────────────────────────────────────────────────────────────────

/** Escape user-controlled strings before interpolating into email HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export type InviteEmailInput = {
  orgName: string
  inviterName: string | null
  role: string
  acceptUrl: string
  invitedEmail: string
  expiresInDays: number
}

export function buildInviteEmail(input: InviteEmailInput): { subject: string; html: string; text: string } {
  const org = input.orgName || 'a Jubo workspace'
  const inviter = input.inviterName?.trim()
  const role = input.role
  const subject = `You're invited to join ${org} on Jubo`
  const invitedBy = inviter ? `${esc(inviter)} invited you` : 'You have been invited'

  const html = `<!-- invite -->
<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1f2937">
  <h1 style="font-size:18px;margin:0 0 4px">Join ${esc(org)} on Jubo</h1>
  <p style="font-size:14px;line-height:1.5;color:#4b5563;margin:0 0 16px">
    ${invitedBy} to join <strong>${esc(org)}</strong> as a <strong>${esc(role)}</strong>.
  </p>
  <p style="margin:0 0 20px">
    <a href="${esc(input.acceptUrl)}" style="display:inline-block;background:#1e3a5f;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">
      Accept invitation
    </a>
  </p>
  <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0 0 8px">
    Or paste this link into your browser:<br>
    <a href="${esc(input.acceptUrl)}" style="color:#1e3a5f;word-break:break-all">${esc(input.acceptUrl)}</a>
  </p>
  <p style="font-size:12px;line-height:1.5;color:#6b7280;margin:0 0 8px">
    This invitation was sent to ${esc(input.invitedEmail)} and expires in ${input.expiresInDays} days.
    Sign in with this email address to accept.
  </p>
  <p style="font-size:12px;line-height:1.5;color:#9ca3af;margin:16px 0 0">
    If you weren't expecting this, you can ignore this email. Need help? Reply to this message.
  </p>
</div>`

  const text = [
    `${inviter ? `${inviter} invited you` : 'You have been invited'} to join ${org} on Jubo as a ${role}.`,
    '',
    `Accept your invitation: ${input.acceptUrl}`,
    '',
    `This invitation was sent to ${input.invitedEmail} and expires in ${input.expiresInDays} days. Sign in with this email address to accept.`,
    '',
    `If you weren't expecting this, you can ignore this email.`,
  ].join('\n')

  return { subject, html, text }
}
