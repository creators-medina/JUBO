# Jubo PR 6A — Monitoring, Error Visibility, and Password Reset

The 30-day production-ops blocker slice from the market-readiness audit: error
monitoring, app-level error boundaries, a password-reset flow, and the setup
docs. **Held for review** — it adds a monitoring provider integration, touches
auth (password reset), and adds optional env + a session-routing allow-list.

---

## 1. Current monitoring state

- **No error monitoring** existed (no Sentry/Datadog/etc. dependency, config, or
  env). Production errors were visible only in raw Vercel/Supabase logs.
- **Error boundaries:** only `app/not-found.tsx` and `app/invite/error.tsx` — no
  root/global boundary and no boundary over the authenticated app.
- **Server/API errors:** best-effort try/catch scattered through actions/routes;
  nothing aggregated or alertable.
- **Password reset:** **did not exist** anywhere (no `resetPasswordForEmail`, no
  forgot/reset pages, no "Forgot password?" link).

Answers: monitoring present? **No.** Global error boundary? **No.** Server
errors captured? **No.** Client errors captured? **No.** Password reset usable?
**No.** Required env for any of it? **None existed.**

## 2. Monitoring provider chosen

**A dependency-free, Sentry-compatible reporter** (`lib/monitoring/report.ts`)
rather than the `@sentry/nextjs` build plugin. Rationale: this is a customized
Next 16 fork with turbopack; adding Sentry's webpack/turbopack plugin +
source-map upload is build-integration risk we don't want in the beta-blocker
slice. The reporter posts a **minimal event** to Sentry's ingestion (`/store/`)
endpoint via raw `fetch` when a DSN is set, and is **completely inert
otherwise**. It's DSN-based, so it works with a real Sentry project today and
can be swapped for the official SDK later if you want session replay, tracing,
or source-map symbolication.

Wired into the official Next.js error surfaces:
- **Server/edge:** `instrumentation.ts` → `onRequestError` (Next 15+ hook) for
  server components, route handlers, and middleware.
- **Client (root):** `app/global-error.tsx`.
- **Client (in-app):** `app/(app)/error.tsx`.

## 3. Env vars required

**All OPTIONAL — nothing is required; everything degrades gracefully.**

| Var | Purpose | Required? |
|---|---|---|
| `SENTRY_DSN` | Server/edge exception ingestion | No — unset ⇒ monitoring inert |
| `NEXT_PUBLIC_SENTRY_DSN` | Client exception ingestion (inlined in browser bundle) | No — unset ⇒ client monitoring inert |
| `NEXT_PUBLIC_SITE_URL` *(already used)* | Base URL for the password-reset redirect | Reused |
| `VERCEL_GIT_COMMIT_SHA` *(Vercel auto-set)* | Release tag on events | No |

**Set the DSNs only in deployed Vercel environments, not local `.env`** — that
keeps dev/local from sending events. (Local dev has no DSN ⇒ no-op.)

## 4. What gets captured

- Uncaught server/edge errors (via `onRequestError`): error type, message,
  truncated stack, `source=server`, and the **route path only**.
- Uncaught client errors (global + in-app boundaries): type, message, stack,
  `source=global|route`, Next error `digest`, and `window.location.pathname`.
- Tags: `environment` (`VERCEL_ENV`/`NODE_ENV`), `runtime`; optional `release`
  from the commit SHA.

## 5. What is intentionally NOT captured

- No request bodies, form data, query strings, headers, or cookies.
- No Supabase session/JWT, no auth tokens, no Twilio/integration secrets.
- No borrower/contact/loan/CRM data of any kind.
- No session replay, no breadcrumbs, no performance/PII payloads.
- No analytics/tracking beacons beyond error events.

## 6. PII / sensitive-data precautions

- The reporter's payload is an explicit allowlist (type/message/stack + a tiny
  context object). It cannot serialize arbitrary request state.
- Query strings are stripped from paths (`split('?')[0]`).
- Stacks are truncated to 30 lines.
- The module **never logs** to console and never sends when no DSN is set.
- Reporter unit-tested (9/9) to confirm: inert without DSN; correct endpoint +
  `sentry_key`; and no `cookie`/`authorization`/query leakage in the body.

## 7. Error boundary behavior

- **`app/global-error.tsx`** — catches root-layout/template errors (production
  only), renders its own `<html>/<body>`, a friendly "Something went wrong —
  please refresh, or contact support" message, and a **Try again** (reset)
  button. No stack trace shown. Reports to monitoring.
- **`app/(app)/error.tsx`** — friendly in-shell boundary for the authenticated
  app; **Try again** (reset) + report. No stack trace shown.
- Existing `app/invite/error.tsx` and `app/not-found.tsx` unchanged.

## 8. Password reset flow (Supabase Auth standard)

1. **Login page** now has a **"Forgot password?"** link.
2. **`/forgot-password`** — collects an email and calls
   `supabase.auth.resetPasswordForEmail(email, { redirectTo: <site>/reset-password })`.
   Always shows the same generic "if an account exists, we sent a link"
   confirmation (no account-enumeration signal).
3. Supabase sends the reset email; the link returns the user to
   **`/reset-password`**, which exchanges the PKCE `code` for a recovery session
   (`exchangeCodeForSession`), confirms a session exists, then calls
   `supabase.auth.updateUser({ password })` (min 8 chars, confirm match). On
   success it routes to `/dashboard`. Invalid/expired/used link ⇒ a safe
   "request a new link" state.
4. **`proxy.ts`** allows `/forgot-password` and `/reset-password` while logged
   out, and (crucially) does **not** treat them as auth routes, so a recovery
   session reaching `/reset-password` is not bounced to `/dashboard` before the
   password is set.

No custom password storage, no token exposure, no weakening of auth — this is
Supabase's own recovery flow. Auth remains email+password via `@supabase/ssr`.

## 9. Supabase / Vercel setup steps

**Monitoring (optional):**
1. Create a Sentry project (platform: JavaScript/Next.js).
2. In Vercel → Project → Settings → Environment Variables, set `SENTRY_DSN` and
   `NEXT_PUBLIC_SENTRY_DSN` to the project DSN (Production/Preview only).
3. Redeploy. Errors will flow to Sentry; local dev stays silent.

**Password reset (required for it to actually email):**
1. Supabase → Authentication → **URL Configuration**: add
   `https://<your-domain>/reset-password` (and the preview domains) to the
   **Redirect URLs** allowlist.
2. Ensure `NEXT_PUBLIC_SITE_URL` is set to the production origin.
3. Supabase → Authentication → **Email**: confirm the "Reset Password" template
   is enabled and SMTP/email delivery is configured (Supabase's built-in email
   has low rate limits — configure a custom SMTP sender for production volume).
4. Recommended (separate, not in this PR): raise the minimum password length and
   confirm email-confirmation policy in Supabase Auth settings.

## 10. Manual test checklist

- [ ] App builds and the login page loads.
- [ ] "Forgot password?" link appears on login.
- [ ] `/forgot-password` submits without crashing; shows the generic confirmation.
- [ ] With Supabase redirect URL configured: the email arrives and its link opens
  `/reset-password`, which lets you set a new password and lands on `/dashboard`.
- [ ] Logging in with the new password works.
- [ ] An expired/used reset link shows the "request a new link" state (no crash).
- [ ] Force an error in a page → `app/(app)/error.tsx` shows the friendly card
  with **Try again**; no stack trace.
- [ ] With a Sentry DSN set in a deployed env, a thrown error appears in Sentry;
  with no DSN (local), nothing is sent.
- [ ] No CRM/SMS/billing/invite behavior changed.

## 11. Remaining ops gaps

- **Alert routing / on-call** (Sentry alert rules) — configure in Sentry.
- **Source-map symbolication** — not wired (would need the official SDK or a
  build-time upload step); stacks are minified in prod until then.
- **Uptime/status page**, structured request logging, and an in-app audit log —
  separate follow-ups.
- **Password policy / MFA** — Supabase-side settings + a later auth PR.
- **Server action-level breadcrumbs** — only uncaught errors are captured, not
  handled-and-swallowed ones.

## 12. External beta readiness after this PR

**Materially improved.** Once the DSNs are set, production errors are visible
and alertable instead of silent; users hit friendly error pages instead of a
blank crash; and account recovery works end-to-end via Supabase's standard
flow (pending the one-time Supabase redirect-URL + email-template setup).
Combined with the earlier hardening PRs, this clears the operational blockers
for a restricted private beta. Remaining items (§11) are refinements, not
blockers.
