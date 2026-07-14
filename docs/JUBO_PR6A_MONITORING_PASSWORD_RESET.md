# Jubo PR 6A — Monitoring, Error Visibility, and Password Reset

The 30-day production-ops blocker slice from the market-readiness audit: error
monitoring, app-level error boundaries, a password-reset flow, and the setup
docs. **Held for review.**

> ## ✅ Safe to merge with ZERO configuration
> - **No Vercel changes required.** No env var is needed; nothing must be set.
> - **No Supabase Dashboard changes required.** No redirect URL, no email/SMTP,
>   no auth-setting change.
> - **Monitoring is INACTIVE** until DSNs are added later (fully inert without
>   them — no throw, no log, no network).
> - **Password reset is NOT exposed to users** — the code ships dormant
>   (unlinked and not routed) until the Supabase reset redirect URL is
>   configured later.
> - **The only immediately active user-facing improvement is the error
>   boundaries** (friendly crash pages), which need no external setup.

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

## 8. Password reset flow (implemented, shipped DORMANT)

The full Supabase-standard flow is implemented, but **intentionally not exposed
or activated in this PR** — it is safe to merge and does nothing until the
one-time activation (§9) is done later.

- **Dormant now:** the "Forgot password?" link is **not** rendered on the login
  page, and `proxy.ts` does **not** allow-list the reset routes — so logged-out
  users are redirected to `/login` if they try to reach them. No user is routed
  into an unconfigured flow.
- **The code that exists** (ready for later activation):
  - **`/forgot-password`** — calls
    `supabase.auth.resetPasswordForEmail(email, { redirectTo: <site>/reset-password })`
    with a generic "if an account exists, we sent a link" confirmation (no
    account-enumeration signal).
  - **`/reset-password`** — exchanges the PKCE `code` for the recovery session
    (`exchangeCodeForSession`), confirms a session, then
    `supabase.auth.updateUser({ password })` (min 8, confirm match) → `/dashboard`;
    invalid/expired/used link ⇒ safe "request a new link" state.
- No custom password storage, no token exposure, no auth weakening. Auth remains
  email+password via `@supabase/ssr` — **unchanged** by this PR.

## 9. Later activation (NOT required for this PR — no setup needed to merge)

Nothing here is needed to merge or to keep the app safe. These are the steps to
turn each capability on **later, when you choose**.

**Monitoring (optional, later):**
1. Create a Sentry project (platform: JavaScript/Next.js).
2. In Vercel → Settings → Environment Variables, set `SENTRY_DSN` +
   `NEXT_PUBLIC_SENTRY_DSN` (Production/Preview). Redeploy. Until then the
   reporter is fully inert.

**Password reset (later — Supabase + one small code change):**
1. Supabase → Authentication → **URL Configuration** → add
   `https://<your-domain>/reset-password` (+ preview domains) to **Redirect URLs**.
2. Confirm the "Reset Password" email template is enabled (and, for volume, a
   custom SMTP sender); ensure `NEXT_PUBLIC_SITE_URL` is the production origin.
3. Re-expose the flow in code: render the "Forgot password?" link on the login
   page and re-add the `/forgot-password` + `/reset-password` allow-list to
   `proxy.ts` (both marked with a NOTE comment where they were removed). This is
   a tiny follow-up PR — no schema, no migration.

## 10. Manual test checklist

**Active now (no setup):**
- [ ] App builds and the login page loads normally.
- [ ] The login page shows **no** "Forgot password?" link (dormant).
- [ ] Force an error in a page → `app/(app)/error.tsx` shows the friendly card
  with **Try again**; no stack trace.
- [ ] With no Sentry DSN (default), nothing is sent and nothing errors/logs.
- [ ] No CRM/SMS/billing/invite behavior changed.

**Later, after activation (§9):**
- [ ] With DSNs set in a deployed env, a thrown error appears in Sentry.
- [ ] After re-exposing the link + allow-list + Supabase redirect URL:
  `/forgot-password` → email → `/reset-password` → new password → `/dashboard`;
  expired/used link shows the safe "request a new link" state.

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

**Improved immediately, with more available on demand.** Right now — with zero
config — users hit **friendly error pages instead of a blank crash**, which is
the one active user-facing win. The monitoring reporter and the full
password-reset flow ship **ready but dormant**: flip monitoring on by setting
the DSNs, and turn reset on with the small §9 activation — neither is required
for this PR to be safe, and neither depends on anything for the app to keep
working today. Combined with the earlier hardening PRs, the error-visibility and
recovery foundation is in place for a restricted private beta; activating it is
a later, low-risk toggle.
