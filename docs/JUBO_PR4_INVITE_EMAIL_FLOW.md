# Jubo PR 4 — Invite Email Flow

Makes team invitations actually send by email instead of requiring the admin to
hand-copy links — while keeping the copy-link flow as a fallback and adding
**no required environment variable and no new npm dependency**.

**Status: HELD FOR REVIEW — do not auto-merge.** This introduces a
transactional-email provider integration and real (opt-in) email-send behavior.

---

## 1. Existing invite flow

- **Create** (`features/organizations/invites.ts` → `inviteMember`): owner/admin
  only (`requireOrgRole('admin')`), validates email + role (only
  `admin`/`manager`/`member` — never `owner`), rejects already-members and
  duplicate pending invites, stores a row in `organization_invitations` with a
  **SHA-256 hash** of a 32-byte random token, `expires_at` = 7 days, returns the
  plaintext token **once** for the copy link.
- **Link** was built client-side from `window.location.origin`
  (`/invite/accept?token=…`) and copied to the clipboard; the UI showed an
  "email delivery isn't set up" banner.
- **Accept** (`acceptInvitation` → SECURITY DEFINER `accept_invitation` RPC):
  authenticated only; row-locked single-use; checks revoked/accepted/expired;
  **email-match** (the signed-in user's address must equal the invited address);
  creates the membership with the invite's role; marks the invite accepted.
- **Preview** (`getInvitationPreview`) powers a logged-out accept page.

## 2. Email provider findings

- **Does Jubo use an email provider? No.** No dependency (Resend/SendGrid/
  Nodemailer/Postmark/SES/etc.), no email-sending code, and no email env vars
  exist anywhere in the repo. Supabase Auth may send its own auth emails, but
  there is no app-level transactional email.
- **Recommended provider: Resend** — simple HTTPS API (no SDK needed, matching
  the repo's raw-`fetch` Twilio client), Vercel-friendly, generous free tier.
  The implementation is behind a provider-agnostic seam, so swapping to
  SendGrid/Postmark/SES means editing one `fetch` in `lib/email/provider.ts`.
- **Migration required? No.** Invites already have everything needed
  (`organization_invitations`, hashed tokens, expiry). No schema change.
- **Is the token flow secure enough to email? Yes** (see §4) — emailing the
  accept link is equivalent to a password-reset link, and the accept-time
  email-match means a leaked link can't be redeemed by another account.

## 3. Implementation approach

- **`lib/email/provider.ts`** — `sendEmail({to,subject,html,text})` and
  `isEmailConfigured()`. Inert unless **both** optional env vars are set
  (`RESEND_API_KEY`, `EMAIL_FROM`); otherwise returns `{ sent:false,
  reason:'not_configured' }`. Never throws, never logs bodies/recipients/links.
- **`lib/email/inviteEmail.ts`** — pure template builder. Renders subject + HTML
  + plain-text with the invited email, org name, inviter name (if available),
  assigned role, an "Accept invitation" CTA, a plain fallback link, a 7-day
  expiry note, and a support note. HTML-escapes all user-controlled fields.
  Carries **no** CRM/contact/loan data.
- **`features/organizations/invites.ts`** — after the invite is created,
  `inviteMember` (and `refreshInviteLink`, which doubles as "resend") build the
  accept URL **server-side** from the existing `NEXT_PUBLIC_SITE_URL` /
  `VERCEL_URL` base and best-effort send the email, returning `emailSent:
  boolean` alongside the token. **The invite is always created regardless of
  email outcome.**
- **UI** (`TeamClient.tsx`, `settings/team/page.tsx`) — the page passes
  `isEmailConfigured()` so the banner reads correctly ("emailed automatically"
  vs "link-based"); the invite modal shows "Invite email sent to X" (with the
  link kept as a backup) when sent, or the copy-link flow when not; the pending
  list's action reads "Resend" when email is on, "Copy link" otherwise.

## 4. Security model (unchanged, re-verified)

- Only owner/admin can create/rotate/revoke invites (`requireOrgRole('admin')`).
- Tokens remain **32 random bytes**, stored **only as a SHA-256 hash**; the
  plaintext exists transiently to build the link/email. Emailing it does not
  weaken this — same posture as any transactional magic link.
- **Accept-time email match**: the RPC requires the signed-in user's address to
  equal the invited address, so a forwarded/leaked link cannot be redeemed by a
  different account, and the role can't be escalated by editing the link (the
  role comes from the server-side invite row, not the URL).
- Expiry (7 days) and single-use (row lock + status flip) unchanged.
- **No token logging**: neither the email provider nor the template logs the
  link; the provider logs nothing at all.
- Membership is still created **only on accept** — no auto-provisioning.

## 5. Environment variables

**Both OPTIONAL — nothing is required; the app degrades to copy-link when unset.**

| Var | Purpose | Required? |
|---|---|---|
| `RESEND_API_KEY` | Resend API key | No — unset ⇒ link-only fallback |
| `EMAIL_FROM` | Verified From address, e.g. `Jubo <team@yourdomain.com>` | No — unset ⇒ link-only fallback |
| `NEXT_PUBLIC_SITE_URL` *(already used)* | Base URL for the accept link in emails | Reused; if unset, falls back to `VERCEL_URL`, else link-only |

To turn email on in production: set `RESEND_API_KEY` + `EMAIL_FROM` (and verify
the sending domain in Resend). No redeploy logic changes — the code already
checks these at send time.

## 6. Failure / fallback behavior

- **Provider not configured** → invite still created; UI shows the copy-link
  flow and the "email isn't configured" banner. No crash.
- **Send fails** (network / non-2xx / no base URL) → invite still created;
  `emailSent:false`; UI shows "email didn't send — copy this link" with the
  link. The invite is never lost.
- **Email succeeds** → `emailSent:true`; UI confirms "Invite email sent to X"
  and still surfaces the link as a backup.

## 7. Manual test checklist

- [ ] With no email env set: create an invite → link-only flow works, banner
  says link-based, no error.
- [ ] Set `RESEND_API_KEY` + `EMAIL_FROM` (test domain): create an invite → email
  arrives with correct org/role/inviter/CTA/fallback link/expiry; UI says
  "Invite email sent to X".
- [ ] Break the key (bad value) → invite still created, UI shows the copy-link
  fallback, no crash.
- [ ] Accept the emailed link while signed in as the invited email → membership
  created with the correct role.
- [ ] Accept while signed in as a different email → `email_mismatch`, no access.
- [ ] Expired/revoked link → fails safely.
- [ ] Non-admin cannot create/resend invites (`forbidden`).
- [ ] "Resend" rotates the token (old link stops working) and re-emails.

## 8. Remaining risks

- **Provider choice is Resend** — held for your approval; swappable in one file.
- **Deliverability** depends on domain verification / SPF-DKIM in Resend
  (customer/vendor setup, outside code).
- **No email audit log** — sends aren't recorded in a table (kept minimal); the
  `emailSent` boolean is surfaced in the UI only. A send-log is a possible
  follow-up.
- **Rate limiting** — invite creation is admin-only and manual, so abuse surface
  is low; no per-org send cap added.
- **`refreshInviteLink` always rotates** the token on resend (existing behavior)
  — the previous link stops working, which is the intended single-use posture.

## 9. External beta readiness after PR 4

**Resolved once the provider env is set.** With `RESEND_API_KEY` + `EMAIL_FROM`
configured and the domain verified, a broker owner/team lead can invite LOs and
staff by email without hand-copying links; until then the flow degrades safely
to the existing link-based invites. No schema, no required env, no auth or
membership behavior change.
