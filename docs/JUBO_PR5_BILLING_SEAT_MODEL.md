# Jubo PR 5 — Billing / Seat Model Foundation

The minimum billing + seat-model foundation for a **paid private beta** — manual
billing, inert-by-default seat enforcement, and Stripe placeholder fields. **No
charging, no Stripe code, no self-serve checkout.**

**Status: HELD FOR REVIEW — do not auto-merge.** Adds schema (a migration) and
seat enforcement. Production SQL is gated — apply via §10 after review.

---

## 1. Current billing state

- **No billing existed** — no Stripe dependency, no billing/subscription/seat/
  plan code, no payment/customer tables, no billing env. (Confirmed by search;
  "plan" hits were all business-plan/production-plan.)
- **Org model:** `organizations` (name, slug, owner, + phase-31a `status`,
  `team_size`, `timezone`, `monthly_volume_goal`). `organization_members`
  (role owner/admin/manager/member, `status` active/disabled, `member_type`).
- **Membership choke points (exactly two, both SECURITY DEFINER):**
  `create_organization_with_owner()` (the owner, at org creation) and
  `accept_invitation()` (invited members). Invite **creation** goes through the
  app action `inviteMember()`. No other path inserts members.
- **No seat/plan representation, no Stripe IDs, no limits** anywhere.

Answers: **Billing today?** No. **Plans/seats?** No. **Stripe IDs stored?** No.
**Single membership choke point?** Two (owner-create + accept). **Single invite
choke point?** Yes (`inviteMember`). **Where should seat enforcement live?** At
invite creation (friendly early block) + invite acceptance (hard backstop).
**What stays inert until configured?** Everything — seat_limit defaults to NULL
(unlimited) and there is no Stripe activation.

## 2. Chosen billing model (minimal, private-beta)

- **`plan_type`**: `internal | beta | paid_beta | trial | suspended` (default `beta`).
- **`seat_limit`**: integer, **nullable — NULL = unlimited** (the safety default).
- **`billing_status`**: `not_configured | trialing | active | past_due | canceled | suspended` (default `not_configured`).
- **Stripe placeholders** (IDs only, not secrets): `stripe_customer_id`,
  `stripe_subscription_id`, `stripe_price_id`, `current_period_end`, plus
  `trial_ends_at`.
- Deliberately **not** built: coupons, metered/usage billing, self-serve plan
  picker, public checkout, automated deletion.

During private beta, plan/seat values are set **manually by the vendor** (SQL
UPDATE in §10) — there is no self-serve way for a customer to change their own
seat limit (which would defeat billing).

## 3. Schema changes

One idempotent migration: `supabase/migrations/20260714000000_pr5_billing_seat_model.sql`.

- Adds the eight columns above to `organizations` (all `ADD COLUMN IF NOT EXISTS`,
  safe defaults) + CHECK constraints on `plan_type`, `billing_status`, and
  `seat_limit >= 1`.
- Recreates `accept_invitation()` with a seat check (see §4). No RLS changes —
  existing member-SELECT / admin-UPDATE policies already cover the new columns.

## 4. Seat enforcement locations

1. **Invite acceptance — `accept_invitation()` (DB, hard backstop):** when the
   org has a `seat_limit` AND a **new** membership would exceed the active-member
   count, returns `seat_limit_reached` instead of inserting. Re-accepts (already
   a member) and the owner-creation path are never affected.
2. **Invite creation — `inviteMember()` (app, friendly early block):** counts
   active members + pending invites; if a `seat_limit` is set and they already
   meet it, returns `seat_limit_reached` before creating the invite. Copy:
   *"Seat limit reached. Increase seats before inviting another user."*

Both are **inert when `seat_limit` is NULL** (the default), so nothing enforces
until a limit is explicitly set.

## 5. Existing-org safety

- `seat_limit` defaults to **NULL = unlimited**, so **every existing org
  (incl. Medina/BOMAC) and every new org is unconstrained** until a numeric limit
  is set. No lockouts.
- Enforcement **only blocks new invite-accepts** over a set limit. It **never**
  deletes members, never blocks existing members, and never touches
  login/session/app access.
- Even if a limit is later set **below** the current headcount, existing members
  keep working — only *new* accepts/invites are blocked until seats are raised.
- Rehearsed on Postgres 16: existing member re-accept is not blocked at a full
  cap (see §11).

## 6. Stripe readiness

- **Prepared, not activated.** Placeholder ID columns exist; **no Stripe SDK, no
  checkout, no webhook, no Stripe API calls** are added. The app builds and runs
  with **zero** Stripe env.
- Future activation (separate, gated PR): a Stripe webhook route to sync
  `billing_status`/`current_period_end`/subscription id, and Checkout for
  self-serve — both requiring `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` +
  price IDs. None required now.

## 7. What is implemented now

- Migration (schema + seat backstop). Seat check in `inviteMember`.
  `seat_limit_reached` copy in the Team invite UI and the invite-accept UI.
- Read-only **Plan & billing** card in Settings → Organization (owner/admin
  only): plan, billing status, **seats used / limit** (or "unlimited"), an
  at-limit hint, and a "billing is manual during private beta" note.
  `getOrgBilling()` is read-only and **never gates app access**.

## 8. What remains manual

- Assigning a plan and seat limit per org (vendor SQL UPDATE, §10).
- Collecting payment and issuing invoices (off-platform during private beta).
- Raising seats when a customer needs more (SQL UPDATE).

## 9. What remains gated

- Stripe integration (checkout + webhook + env), self-serve plan changes, public
  billing, invoices/dunning, trial automation, and org suspension enforcement
  (`billing_status='suspended'`/`plan_type='suspended'` are stored but **not**
  yet enforced against app access — enforcing them is a deliberate, separate,
  approved change so no one is surprised-locked-out).

## 10. Production runbook (Supabase SQL Editor — GATED)

**Risk: low.** Adding nullable/defaulted columns is metadata-only (no table
rewrite); recreating one function is instant. No data is modified.

### A. Pre-flight (read-only)
```sql
-- Columns should NOT yet exist (0 rows) before applying.
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='organizations'
  AND column_name IN ('plan_type','seat_limit','billing_status','stripe_customer_id');
-- accept_invitation exists (baseline).
SELECT proname FROM pg_proc WHERE proname='accept_invitation';
```

### B. Migration
Paste the full contents of
`supabase/migrations/20260714000000_pr5_billing_seat_model.sql` and run.

### C. Post-migration (read-only)
```sql
-- 1. All 8 columns present with safe defaults.
SELECT column_name, column_default, is_nullable FROM information_schema.columns
WHERE table_schema='public' AND table_name='organizations'
  AND column_name IN ('plan_type','seat_limit','billing_status','trial_ends_at',
                      'stripe_customer_id','stripe_subscription_id','stripe_price_id','current_period_end')
ORDER BY column_name;
-- Expected: plan_type default 'beta' NOT NULL; billing_status default 'not_configured' NOT NULL;
--           seat_limit + stripe_* + *_end nullable, no default.

-- 2. Every existing org is unlimited + unconfigured (no lockouts).
SELECT count(*) AS total, count(*) FILTER (WHERE seat_limit IS NULL) AS unlimited,
       count(*) FILTER (WHERE plan_type='beta') AS beta
FROM public.organizations;   -- Expected: unlimited = total, beta = total

-- 3. Seat guard present in the function.
SELECT pg_get_functiondef(oid) ILIKE '%seat_limit_reached%' AS has_seat_check
FROM pg_proc WHERE proname='accept_invitation';   -- Expected: true
```

### D. Assign a plan/seats to a customer (manual, per-org, when ready)
```sql
-- Example: put an org on paid beta with 10 seats. Owner/vendor action only.
UPDATE public.organizations
SET plan_type='paid_beta', billing_status='active', seat_limit=10
WHERE slug='<org-slug>';
```

### E. Rollback notes
- Seat enforcement is inert while `seat_limit IS NULL`; to disable it for an org,
  `UPDATE ... SET seat_limit=NULL`.
- To fully revert the function: re-apply the phase-31c `accept_invitation` body
  (git history). Columns can stay (harmless) or be dropped
  (`ALTER TABLE public.organizations DROP COLUMN IF EXISTS ...`) — dropping is
  destructive of any billing values set, so prefer leaving them.

## 11. Local migration rehearsal result

Postgres 16, mocked `auth.uid()`, real migration applied. **All pass:**

| Check | Result |
|---|---|
| Existing org gets safe defaults (beta / NULL seats / not_configured) | **PASS** |
| Unlimited org (NULL) accepts freely | **PASS** |
| Capped org at limit blocks a new accept (`seat_limit_reached`) | **PASS** |
| No member row added when blocked | **PASS** |
| Capped org under limit accepts after raising seats | **PASS** |
| Existing member re-accept never blocked at a full cap | **PASS** |
| `plan_type` CHECK rejects bad values | **PASS** |
| Idempotent re-apply | **PASS** |

## 12. Private-beta pricing recommendation

Per the market-readiness audit §17: **$99/LO/month, 5-seat minimum**
(~$495/mo/team floor), month-to-month, **plus a $750–1,500 one-time concierge
setup fee** (imports, board setup, Twilio/A2P help), founding-customer rate
locked 12 months. Free/founder tier acceptable for the first design partners.

## 13. Public-launch billing gaps

Self-serve Checkout + customer portal, webhook-driven `billing_status` sync,
dunning/past-due handling, trials with auto-expiry, invoices, plan upgrades/
downgrades, proration, and enforced suspension — all deferred to the gated
Stripe activation PR(s).
