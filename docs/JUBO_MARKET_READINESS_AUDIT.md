# Jubo Market Readiness Audit

**What must be true before Jubo can safely be sold to other mortgage companies,
broker owners, branch managers, and loan officers as a paid SaaS platform.**

Audit-only: no code, schema, data, auth, SMS, billing, or behavior was changed.
Grounded in a full code audit (RLS/migrations, server actions, API routes,
SMS/Twilio paths, onboarding, billing search) plus the existing docs
(`JUBO_OPERATOR_AUDIT`, `JUBO_30_MIN_TESTER_TRIAGE`, `JUBO_CORE_NAV_AUDIT`,
`JUBO_PROSPECTING_BOARD_DECISION`, `JUBO_DISCOVERY_REPORT`, `perf-audit`).
File:line evidence cited throughout. Items that could not be verified from this
environment (production Supabase settings, live grants) are marked **verify**.

> **PR 1 done (T1 + T2) — applied and verified in production 2026-07-13:** the
> two critical multi-tenancy blockers (`move_record` cross-tenant primitive,
> `field_values` Realtime DELETE leak) are closed. Migration
> `20260713000000_pr1_multitenancy_hardening.sql` (PR #104, `c14f38e`); details
> and runbook in `docs/JUBO_PR1_MULTITENANCY_HARDENING.md`. The other critical
> blockers in §6 remain open. The broader Realtime DELETE class on the filtered
> tables (records/tasks/board_groups/fields/activities) is a documented
> fast-follow.

---

## 1. Executive summary

Jubo's **multi-tenant foundation is genuinely strong** — all 56 tables have
RLS with org-membership policies, no `USING (true)` policies exist, the
service-role key is confined to three API routes, invite tokens are hashed,
Twilio webhooks are signature-validated per-org, and no third-party analytics
or beacons exist. This is far better than most pre-commercial codebases.

But it is **not safe to onboard an outside company today**, for five concrete
reasons:

1. **One critical isolation hole:** the `move_record` RPC is SECURITY DEFINER
   with no auth/membership check and no `REVOKE FROM PUBLIC` — an
   anon-callable cross-tenant write/delete primitive (§9, T1).
2. **A probable cross-org read leak via Realtime DELETE events** (RLS is not
   applied to DELETE events; `REPLICA IDENTITY FULL` broadcasts full old rows
   of `field_values`) (§9, T2).
3. **The flagship page breaks for every new org:** template-provisioned boards
   don't match the Daily Call Log's theme-day matchers — Tuesday, Wednesday,
   and Friday queues are empty with "not found" chips (§13).
4. **SMS compliance is not sellable:** zero consent capture, an opt-out check
   that a phone-format mismatch bypasses, no A2P 10DLC story, and Twilio
   tokens in plaintext readable by every org member (§11).
5. **Zero commercial rails:** no billing, no plan/seat model, no error
   monitoring, no password reset, no data export/offboarding, no ToS/privacy
   policy, no CI (§12, §14).

None of these is architectural rework. The isolation fixes are one migration
batch; the theme-day fix is small code; the SMS fixes are a focused pass. The
product itself — Daily Call Log → Log Call → Greatness Tracker → Production
Plan loop — is real, differentiated, and demoable today.

## 2. Overall readiness rating

**Demo-ready today. Not external-beta-ready today.**
Estimated distance to a safe, restricted private beta: **~30 days of focused
work** (PRs 1–3 below). Distance to charging money with concierge onboarding:
**~60 days**. Distance to self-serve public launch: **90+ days**.

| Dimension | Rating (1–5) |
|---|---|
| Multi-tenant architecture | 4 — sound design, one critical hole + verify items |
| Security/privacy operations | 2 — no monitoring, no reset/MFA, no audit log, no lifecycle |
| Mortgage compliance posture | 2 — CRM-only scope is right, but SMS/retention/legal artifacts missing |
| SMS/Twilio | 2 — good skeleton (signatures, opt-out check, choke point), compliance gaps |
| Billing | 0 — does not exist |
| Onboarding (self-serve) | 3.5 — genuinely self-serve except theme-day boards + invite email |
| Support/operations | 1 — no monitoring, docs, vendor tooling, or offboarding |
| Product (single-org daily loop) | 4 — the LO loop is good; perf and page overlap drag it |

## 3. Recommended launch path

**Today: A — not ready for external beta.**
**After PRs 1–4 + the monitoring slice of PR 6 + legal (~30 days): B — private beta with restrictions.**
**After PRs 5–7 (~60 days): C — paid private beta with concierge onboarding.**
**Public launch (D): 90+ days, only after the §8 list.**

The restrictions that make B safe are in §16. The honest one-line version:
fix the two isolation items and the theme-day mismatch, add error monitoring
and a password reset, and Jubo can take 3–5 friendly brokerages on free
design-partner terms — with SMS off or manual-only until PR 2 lands.

## 4. Best target customer

**The producing branch manager / team lead of a 3–15 LO team at an
independent brokerage** — someone who personally feels the "my LOs don't
prospect consistently" pain, owns the budget, and can mandate a daily ritual.

- They buy accountability (Greatness Tracker, call logs, streaks) — Jubo's
  differentiated strength — not another contact database.
- Multi-seat from day one; one champion onboards the whole team.
- Second-best: the individual high-intent producing LO ($100–200/mo
  self-purchase) — good for beta feedback, weaker economics and churnier.
- Wrong first customer: large lenders/banks (procurement, security
  questionnaires, SSO/compliance demands Jubo can't meet for a year).

## 5. Best positioning

**B — Mortgage Daily Execution System** (primary), with C's accountability
language as the team-sale layer. Full analysis in §"Positioning" below (§15b).
The thesis line is right and should be the homepage: *"Open Jubo, know who to
call, work your pipeline, track your activity, and close more loans."*

## 6. Critical blockers before ANY external beta

Every item here is a stop-ship for letting an outside company in. All are
**approval-gated** under `JUBO_SAFETY_RULES.md` where marked.

| # | Blocker | Evidence | Gate |
|---|---|---|---|
| B1 | Harden `move_record` RPC: add `is_org_member` + destination group↔board↔org validation + `REVOKE ALL FROM PUBLIC; GRANT TO authenticated` | `20260514200128_move_record_rpc.sql`, re-created `20260619000000` with no auth check, no REVOKE anywhere | **Migration** |
| B2 | Close the Realtime DELETE leak: verify on prod, then drop `field_values` (at minimum) from the realtime publication or revert `REPLICA IDENTITY FULL` | `20260514214447_enable_realtime.sql`; Realtime does not RLS-filter DELETE events | **Migration + verify** |
| B3 | Fix theme-day board mismatch — new orgs get empty Tue/Wed/Fri call queues | templates `features/onboarding/templates/boards.ts:98-175` vs matchers `features/prospecting/themeday/queues.ts:60-77` | Code (product decision on approach) |
| B4 | Error monitoring (Sentry or similar) + an `(app)/error.tsx` boundary — today production failures are invisible | no monitoring dep anywhere; one error boundary (`app/invite/error.tsx`) | Code + vendor setup |
| B5 | Password reset flow + verify production auth posture (email confirmation ON, password min length, Supabase rate limits) | no `resetPasswordForEmail` anywhere; `supabase/config.toml:177` shows min length 6 locally | Code + **auth settings** |
| B6 | Admin-gate credentials & destructive ops: Twilio config, integration tokens, bulk record delete are all lowest-role-member accessible | `features/conversations/actions.ts:111`, `features/integrations/actions.ts:24-59`, `features/records/actions.ts:445`, RLS `20260528000000:39-44` | **Auth/permission + migration** |
| B7 | Terms of Service + Privacy Policy + a signed beta agreement (data processing terms) — none exist | no legal pages anywhere | Legal (attorney) |
| B8 | Verify in prod: phase-31A self-insert policy drop actually ran; `move_record` live grants; no legacy memberships from the pre-31A hole | migration order unverifiable from repo | **Prod SQL check** |

## 7. Must-fix before PAID beta

1. **Billing v1** — plan + seat limit on `organizations` (or a 1:1 subscriptions
   table), enforcement in the two membership choke points
   (`accept_invitation()` RPC + `invites.ts`), a `requireOrgPlan()` guard,
   Stripe checkout/webhook (**schema + integration — gated**). Manual
   invoicing is acceptable for the first handful; the seat model is not.
2. **SMS external-readiness pass (PR 2, §11)** — E.164 normalization of the
   opt-out check and thread keying, consent field + send gate, Messaging-
   Service-only inbound gap, status-webhook signature bypass, failed-send
   logging, A2P 10DLC guidance. Until then: SMS disabled or manual-only for
   beta orgs.
3. **Audit log** of destructive/privileged actions (deletes, role changes,
   credential changes) — append-only table written from the guard layer
   (**schema — gated**).
4. **Customer data export** (records + field values + communication logs as
   CSV) and a documented org-offboarding/deletion path. Mortgage companies
   will contractually require both.
5. **Invite email delivery** + production SMTP verified (today invite links
   are hand-copied; `features/organizations/invites.ts:93`).
6. **CI** — a GitHub Action running build + lint on PRs (no `.github/` exists).
7. **Vendor support runbooks** — documented, minimal service-role procedures
   for org fix-ups; cross-org feedback view or an ops query pack.

## 8. Must-fix before PUBLIC launch

1. Self-serve billing lifecycle: trials, failed payments/dunning, cancellation,
   invoices, plan upgrades.
2. MFA (TOTP) at least for org admins; security headers/CSP
   (`next.config.ts` has none); rate limiting on auth and webhooks.
3. Encrypt Twilio credentials at rest; hash integration webhook tokens
   (invite tokens already set the pattern); stop accepting webhook tokens in
   URL query strings.
4. Help center + in-app onboarding help; support channel with SLA; status page.
5. Performance pass: the universal 2–4s per-action latency (per `perf-audit.md`
   — serial round-trips × per-hop latency; verify Vercel↔Supabase regions,
   reduce hops, add optimistic updates).
6. Org-consistency checks in the SECURITY DEFINER RPC family
   (`create_note`, `log_workflow_execution`, `create_daily_action`,
   `upsert_daily_progress`, `set_goal_targets`) — cross-tenant write-pollution
   class (**migrations — gated**).
7. Canonical active-org context before multi-org users exist
   (`requireUserOrg` takes first membership; `guards.ts:81-93`).
8. Enforce `organizations.status='disabled'` in `is_org_member` (suspension
   hook exists but is inert) (**migration — gated**).
9. Formal compliance package: GLBA service-provider posture, retention
   controls, DPA template, security whitepaper (§10).
10. IA consolidation (one "today" front door) and the remaining tester-triage
    items — new users must not need Jason to explain which page is real.

## 9. Multi-tenancy / security findings (detail)

**Sound:** single tenant root (`organizations` → `organization_members` with
owner/admin/manager/member), `is_org_member()`/`is_org_admin()` SECURITY
DEFINER helpers requiring active membership, RLS enabled on **all 56 tables**
with org policies (mechanically verified), no `USING (true)` anywhere,
service-role confined to `lib/supabase/admin.ts` → 3 API routes, org derived
from hashed-token/number matching in webhooks (never caller input), hashed +
email-matched + single-use invites, the historical self-insert-as-owner hole
found and dropped in phase 31A.

**Top findings (T-numbers referenced elsewhere):**

- **T1 (CRITICAL)** — `move_record()`: SECURITY DEFINER, no `auth.uid()`/
  membership check, never `REVOKE`d, so callable by `anon` under default
  grants. Lets anyone move any record in any org (including cross-org
  group ids), inject `record_movements`/`activities` rows with arbitrary
  `moved_by`, and (via the phase-34B2B version) delete a record's
  default-status `field_values`. Its sibling `move_record_to_board` does all
  the right checks (`20260611000000:43-55,101-102`) — this one was simply
  never hardened.
- **T2 (HIGH, verify)** — Realtime publication includes `records`,
  `field_values`, `tasks`, `board_groups`, `fields`, `activities` with
  `REPLICA IDENTITY FULL`. Supabase Realtime does not apply RLS to DELETE
  events, and normal operation deletes `field_values` rows constantly
  (`reset_default_status`, cross-board moves) — so another org's names,
  phones, and amounts are plausibly broadcast to any hand-rolled subscriber.
  Verify on the live project, then unpublish/repair.
- **T3 (MODERATE)** — RPC org-consistency gaps (§8.6): members of org A can
  write rows referencing org B objects (e.g., increment org B's workflow
  `execution_count`). Write pollution, not read leaks.
- **T4 (MODERATE)** — within-org privilege granularity: lowest-role members
  can bulk-delete records permanently, delete boards/fields/dashboards, and
  read/change Twilio + integration credentials (§6 B6).
- **T5 (LOW)** — `common_field_backfill_audit` rows with NULL org are
  readable/writable by any authenticated user; Twilio status webhook skips
  signature validation when org config is missing
  (`app/api/webhooks/twilio/status/route.ts:32-39`); integration webhook
  tokens accepted via URL query string and stored/displayed in plaintext.
- **Storage:** no Supabase Storage usage at all — imports are parsed
  client-side and never stored as files. Genuinely good posture.
- **Analytics:** first-party only (`analytics_events`); no external beacons,
  no PII in console logs, no hardcoded secrets found.

## 10. Mortgage compliance / legal review findings

**Not legal advice — an issue-spotting list for a fintech attorney.**

1. **CRM vs credit decisioning — currently clean, keep it that way.** Jubo
   stores contacts, stages, tasks, and messages; it makes no credit
   decisions, no scoring, no eligibility filtering. This is the single most
   important compliance property to preserve. iSoft credit pulls (Phase 6,
   gated) change the picture entirely — FCRA permissible purpose, adverse
   action, and data security obligations arrive with it; do not build it
   without counsel.
2. **Fair lending / ECOA-adjacent risk:** low today because call queues are
   board-membership based, not scored. Risk appears if Jubo ever adds "lead
   scoring"/AI prioritization that could proxy protected classes, or coaching
   copy that steers who to serve. Any future scoring feature needs a fair-
   lending review before shipping. Marketing must not describe Jubo as making
   lending recommendations.
3. **Adverse action:** not applicable while no credit data exists. Flag for
   the iSoft phase.
4. **RESPA §8 (referrals/kickbacks):** Jubo's Realtor/Referral-Partner
   tracking is standard relationship CRM and fine; the risk is *marketing
   language* or features that imply exchanging things of value for referrals
   (e.g., anything gamifying "reward your top referring realtor"). Have
   counsel review homepage/onboarding copy around referral features; add
   nothing that tracks gifts/value given to referral sources.
5. **TCPA / SMS:** the material product gap (§11). Selling a texting tool to
   mortgage companies without consent capture, reliable opt-out, and A2P
   registration guidance transfers real legal risk to customers and
   reputational/contractual risk to Jubo. Texting features should be
   contractually the customer's responsibility (they bring their own Twilio
   account and consent) — but the product must at least not *defeat* opt-outs
   (the E.164 normalization bug does exactly that).
6. **GLBA:** mortgage companies are financial institutions; Jubo holding
   their customer NPI makes it a service provider that will be asked for
   safeguards (security program, breach notice terms, DPA). The §7/§8
   security items are the substance; the paperwork (DPA template, security
   overview one-pager) should exist before paid beta.
7. **Record retention / integrity:** communication history is currently
   *mutable* — `communication_logs` UPDATE/DELETE is allowed for
   creator-or-admin (`20260531000000:49-53`), and there is no retention or
   export capability. Mortgage customers have retention obligations; at
   minimum offer export and consider making message bodies append-only.
8. **Disclaimers needed in-product:** "not a system of record for loan
   files," "not legal/compliance advice" on coaching content, honest-metrics
   footnotes (already the house style), and beta terms.
9. **State privacy laws (CCPA/etc.):** deletion/export requests currently
   cannot be honored (§14) — needed before public launch.

**Recommended review package for the attorney:** ToS, privacy policy, DPA,
beta agreement, SMS/TCPA feature review, RESPA marketing-copy review.

## 11. SMS / Twilio readiness findings

**Architecture:** per-org Twilio connection in `integration_connections`
(each org brings its own SID/token/number), single outbound choke point
(`sendSMS`, `features/conversations/actions.ts:45-92`), signature-validated
inbound webhook with timing-safe compare, idempotent inbound with DB-level
MessageSid dedupe, STOP/UNSUBSCRIBE detection per CTIA keywords, full logging
of successful traffic. No bulk send, no workflow-triggered SMS, no scheduled
sends exist — human-initiated one-at-a-time only, which limits today's blast
risk.

**Blocking findings before any external customer texts:**

| # | Finding | Evidence |
|---|---|---|
| S1 | **Opt-out bypass by phone format**: suppressions stored as Twilio E.164 `From`, but `isPhoneOptedOut` matches exact strings — a record storing `(212) 555-1234` sails past a STOP from `+12125551234`. Same non-normalization splits one person into two threads | `inbound/route.ts:45-46` vs `queries.ts:89-98`; `logSMS.ts:53-60` |
| S2 | **Zero consent capture** — no opt-in field, source, timestamp, import mapping, or send gate anywhere (only loan-doc eConsent fields exist, which are unrelated) | repo-wide grep |
| S3 | **Messaging-Service-only orgs lose ALL inbound silently — including STOPs** (org resolution matches only `twilio_phone`) | `queries.ts:114-126` |
| S4 | **Twilio auth token plaintext + member-readable/writable** | `actions.ts:123-133`; RLS `20260528000000:39-44` |
| S5 | **No A2P 10DLC anything** — unregistered customers will hit carrier filtering with opaque `undelivered` statuses | repo-wide |
| S6 | Status webhook skips signature validation when org config is missing; MessageSid lookup unscoped | `status/route.ts:32-44` |
| S7 | Failed sends never logged anywhere; no Twilio error-code mapping; StatusCallback only attached if site-URL env present | `actions.ts:71-72,28-31` |
| S8 | Opt-out lifecycle incomplete: no START re-opt-in, no HELP response, no opt-out confirmation, no in-UI opted-out indicator, admin can delete suppressions with no audit | `types.ts:53-65`, RLS `:68-69` |
| S9 | First-thread auto-mark-read on page mount (documented Phase-3 follow-up) | `ConversationsPageClient.tsx:70` |
| S10 | No conversation export; message bodies mutable (§10.7) | — |

**Beta stance:** ship private beta with SMS **off by default** (or explicitly
"manual replies only, you attest to consent") until S1–S6 land in PR 2.

## 12. Billing readiness findings

**Confirmed zero.** No Stripe dependency, no billing/plan/seat/trial/invoice
code, migrations, or env vars anywhere (exhaustive search; only false
positives). Nothing can be *sold* today except by handshake + manual invoice.

What exists to build on: `organizations.status ('active'|'disabled')` — an
unused suspension hook; `organization_members` with roles and
producer/support `member_type`; exactly two membership choke points
(`accept_invitation()` RPC and invite creation) where a seat cap can be
enforced race-safely; the `requireOrgRole` guard pattern that a
`requireOrgPlan` twin can follow.

Minimum paid-beta build (schema-gated): `plan`, `seat_limit`,
`trial_ends_at`, `billing_customer_id` on organizations (or a 1:1 table),
seat enforcement in the two choke points, Stripe Checkout + customer portal +
webhook route, and manual fallback. Recommendation: **manual invoicing for
the first 3–5 concierge customers** (no code), Stripe when the second cohort
starts.

Pricing recommendations are in §17.

## 13. Onboarding readiness findings

**The happy path genuinely works self-serve** — public signup → org creation
(SECURITY DEFINER RPC) → 9-step wizard (production, goals, plan inputs, focus)
→ provisioning (5 boards with mortgage fields, goal engine + funnel, 3
dashboards, ~6 workflows, setup checklist) → in-wizard CSV/XLSX imports with
confidence-gated auto-import, dedupe on email/phone/name, needs-review
fallback. Empty states are honest; nothing hard-crashes on a zero-data org.

**Gaps:**

1. **Theme-day mismatch (top product blocker, §6 B3):** templates create
   Prospecting / Active Leads / Loan Pipeline / Past Clients / Realtors-
   Partners; matchers need `realtor` ✓, `pastclient` ✓, but `inprocess` +
   `inactive` (Tue), `preapp` (Wed), `vip` (Fri) match nothing. Every new org
   sees empty queues + "not found" chips 3 of 5 weekdays on the flagship
   page. Fix options (product decision): add/rename template boards, or make
   matchers template-key aware (board metadata beats name matching).
2. **Invite emails are never sent** — admins hand-copy links (`invites.ts:93`).
3. **Production auth email unverified** — if signup confirmation is ON with
   no SMTP, external signups dead-end (**verify**).
4. Slug collision shows a raw Postgres error; onboarding integrations step is
   intent-capture only (all four providers `available: false`); Twilio setup
   requires manual console webhook configuration; no A2P guidance.
5. Wizard is 9 steps (heavy but skippable) — acceptable for concierge beta;
   trim before self-serve.

## 14. Support / operations readiness findings

- **Monitoring: none.** No Sentry/alerting; one error boundary total
  (`app/invite/error.tsx`); silent best-effort catches throughout.
- **Help/docs: none.** No help route, tour, FAQ, or support contact;
  `docs/` is internal; README is boilerplate.
- **Feedback:** works in-app (bug/feature/general → `feedback_submissions`),
  but org-scoped only — the vendor cannot see customer feedback without
  direct DB access; no notification.
- **Vendor admin plane: none.** No superadmin/impersonation (good for risk,
  but support = raw service-role SQL: uncontrolled, unlogged). Needs
  documented runbooks (beta) → real tooling (public).
- **Offboarding: none.** No org deletion path, no user deletion (membership
  removal leaves the auth user), no data export beyond three narrow report
  CSVs, no retention policy — SMS bodies and raw LOS payloads accumulate
  forever.
- **Release/process:** no `.github/`, no CI, no tests (repo has no test
  script); migrations applied manually via dashboard (established 10A
  routine); one daily cron (secret-gated). Vercel auto-deploy assumed.
- **Status page:** none; acceptable for private beta, needed by public.

## 15. Product readiness scorecard

Ratings assume the buyer is an outside brokerage, not Jason's own org.
(Note: the app has **Kanban and Table** views only — there is no List view.)

| Area | Rating | Why |
|---|---|---|
| Daily Call Log (theme days, Log Call, scripts, history) | **Demo-ready; NOT private-beta ready for new orgs** | The loop is the product's best surface — but empty Tue/Wed/Fri for template orgs (§13.1) |
| Greatness Tracker (manual grid + verified results + backend weeks) | **Private-beta ready** | Durable backend since 10B/10C; honest labels; per-LO caveats documented |
| Prospecting board / raw lead inbox | **Private-beta ready** | Purpose line + per-board default view shipped (#102); depends on phase-5M migration in prod (**verify**) |
| Contact card (trifold) | **Private-beta ready** | Strong after 4a/2.0/2.1 + direct-open fix; needs a real-data pass on Borrower/Financial tabs |
| Conversations / SMS inbox | **Demo-ready only** | UI foundation good (PR C); compliance gaps (§11) keep external texting off |
| Dashboard | **Private-beta ready with caveats** | Honest movement-dated metrics; needs Jason's repro session (PR B) + small-laptop layout check |
| Action Center (/today) | **Demo-ready** | Faster after speed pass (#98), but load-bearing on-load jobs + purpose overlap confuse new users |
| Boards (Kanban/Table, action menu, cross-board drag) | **Private-beta ready** | Solid; no delete/archive (currently a safety feature) |
| Onboarding wizard + imports | **Private-beta ready** | Genuinely self-serve; 9 steps heavy; invite email missing |
| Empty states | **Private-beta ready** | Consistently honest across surfaces |
| Navigation/IA | **Demo-ready** | Three "today" doors + two plan pages still need consolidation (documented plan exists) |
| Performance | **Demo-ready** | Universal 2–4s per action (`perf-audit.md`) — tolerable for friendly beta, corrosive at scale |
| Mobile/tablet | **Demo-ready** | Correct overflow patterns; trifold stacks; no dedicated phone QA pass yet |

**Overall product verdict:** with B3 fixed, the core daily loop is
private-beta ready; Conversations is the one surface that must stay
restricted.

### 15b. Positioning analysis (audit area 9)

| Option | Verdict |
|---|---|
| A. Mortgage CRM | **Avoid as primary.** Puts Jubo in a feature-checklist war with GHL/Salesforce/Jungo it cannot win (no email marketing, no dialer, no automation campaigns) and attracts rip-and-replace expectations |
| B. Mortgage Daily Execution System | **Winner.** Matches what's actually built (call log, theme days, tracker, plan math), is differentiated, and sets the right scope expectations |
| C. Sales Accountability Platform | Strong **secondary** for the team-lead buyer ("see whether your LOs did the work") — lead with B, sell C in the manager conversation |
| D. Team Operating System | Overclaims — no manager rollups, leaderboards, or org reporting yet (operator audit §admin) |
| E. AI-powered coaching/workflow | **Do not claim.** Coach insights are rule-based; "AI" invites scrutiny the product can't back and compliance questions it doesn't need (§10.2) |

- **Best first buyer:** producing branch manager / team lead, 3–15 LOs (§4).
- **Strongest pain point:** "My LOs don't consistently prospect, and I can't
  see whether they did" — Jubo answers both halves in one daily ritual.
- **Most dangerous positioning mistake:** selling it as a full CRM/GHL
  replacement — buyers churn when email campaigns, dialers, and automations
  aren't there.
- **Do not claim yet:** AI coaching, SMS marketing at scale, compliance
  features of any kind, LOS integrations (catalog is intent-only), manager
  analytics, mobile app.

## 16. Recommended private beta scope

- **3–5 design-partner brokerages**, personally known, 2–15 seats each,
  free or founder-priced, on a signed beta agreement (data terms + no-SLA).
- **Concierge onboarding:** Jason runs the wizard with them, imports their
  lists on a call, hand-creates/renames any missing theme-day boards until B3
  ships, and pastes invite links.
- **SMS off** (or "manual replies only + customer attests to consent") until
  PR 2 lands; Twilio connection done together on a call.
- **Explicit exclusions:** no LOS integration promises, no credit pulls, no
  bulk texting, no API.
- **Success criteria before opening paid beta:** ≥60% of seats logging calls
  3+ days/week in week 4; zero cross-org incidents; zero data-loss incidents;
  a written testimonial from at least two teams.

## 17. Suggested beta pricing / packages

Directional — validate against the design partners.

- **Private beta (now → day 60):** $0, or $99/mo flat per team as a
  commitment filter. In exchange: weekly feedback call + logo/testimonial
  rights.
- **Paid beta (concierge, day 60+):** **$99/LO/month**, 5-seat minimum
  (~$495/mo/team floor), month-to-month, **plus a $750–1,500 one-time
  concierge setup fee** (justified: imports, board setup, Twilio/A2P
  hand-holding — it also pays for the labor that replaces missing self-serve).
  Founding-customer rate locked for 12 months.
- **Public launch:** ~$79–129/LO/month tiered (Solo $99 / Team $89/seat at
  5+ / Branch custom at 25+), 14-day trial, annual discount ~2 months. Setup
  fee drops away for self-serve, retained for white-glove migrations.
- Anchor against: Jungo (~$99), Whiteboard CRM (~$79–99), GHL agency plans —
  $99/LO is mid-market-credible; the accountability story is the premium
  justification. One funded loan pays for years of the product; say so.

## 18. 30-day readiness roadmap (→ private beta, launch path B)

Sequenced per Jason's priority order (§21). One standing exception: a minimal
slice of workstream 6 (Sentry + a global error boundary) is a stop-ship
blocker (B4) and lands inside the first 30 days regardless of its position in
the priority list.

| Week | Work |
|---|---|
| 1 | **PR 1 (gated migration batch):** harden `move_record` (B1); realtime DELETE verify + unpublish `field_values` (B2); admin-gate credentials + destructive ops (B6); prod checks (B8). Rehearse on local PG per the established 10A pattern; Jason applies via dashboard |
| 2 | **PR 2 (gated — SMS safety/consent):** E.164 normalization of opt-out + threads (S1), consent field + send gate (S2), Messaging-Service inbound fix (S3), status-webhook signature fix (S6). Remaining S-items follow in the 60-day window |
| 2–3 | **PR 3:** theme-day template fix (B3 — product decision: rename templates vs template-key matching); slug-collision copy fix. **PR 4:** invite-email delivery + prod SMTP verification (B5 auth-email check rides along) |
| 3 | **PR 6 (minimal slice):** Sentry + `(app)/error.tsx` + alerting (B4); password reset flow + prod auth settings verification (B5) |
| 3–4 | Legal: ToS/privacy/beta agreement drafted with counsel (B7) |
| 4 | Onboard design partner #1 concierge-style; SMS still restricted until PR 2 is verified in prod |

## 19. 60-day readiness roadmap (→ paid beta, launch path C)

- **PR 2 follow-through — SMS external readiness, remaining items (gated):**
  token encryption/RLS tightening (S4), A2P guidance page (S5), failed-send
  logging + error mapping (S7), opt-out lifecycle completeness (S8), consent
  import mapping. Enable SMS for beta orgs that attest consent.
- **PR 5 — billing/seat foundation (gated schema):** plan/seat columns, seat
  enforcement at the two choke points, `requireOrgPlan`, Stripe Checkout +
  webhook; manual-invoice fallback retained.
- **PR 6 (full) — error monitoring / support ops:** alert routing, cross-org
  feedback visibility for the vendor, documented service-role support
  runbooks, audit-log table for destructive/privileged actions (gated schema),
  CI (build + lint on PR) and a smoke-test script.
- **PR 7 — data export/offboarding:** customer CSV export
  (records/fields/communications) + documented org-offboarding/deletion
  runbook.
- Onboard partners #2–5; convert to paid concierge terms.

## 20. 90-day launch roadmap (→ public launch readiness, path D)

- Self-serve billing lifecycle (trials, dunning, cancellation, invoices).
- Performance program: region alignment check, hop reduction on card open /
  tab switches, optimistic updates (perf-audit fix plan).
- MFA for admins, security headers/CSP, rate limiting, webhook-token hashing.
- RPC org-consistency batch + disabled-org enforcement + active-org context
  (§8.6–8.8).
- Help center, in-app tours, support inbox + SLA, status page.
- IA consolidation step 2 (one today-surface), onboarding trim, phone QA pass.
- Marketing site + waitlist; two case studies from beta; SOC 2 scoping
  decision (buyers will ask; a security one-pager suffices at first).
- **Go/no-go:** public launch only after §8 items 1–4 are done and two paid
  cohorts have run a full month without a P1.

## 21. Exact recommended next PRs

Sequence set by Jason (owner priority order, 2026-07-13):

| # | PR | Contents | Gate |
|---|---|---|---|
| 1 | **Multi-tenancy/RLS critical blockers** | ✅ **Part 1 done (PR #104, `c14f38e`, applied+verified in prod):** `move_record` hardening (B1) + `field_values` REPLICA IDENTITY DEFAULT (B2). **Still open in this workstream:** admin-gating of credentials + destructive ops (B6), `common_field_backfill_audit` policy fix, and the filtered-tables Realtime DELETE class — a follow-up gated migration | **Schema/migration + auth/permission-gated** — explicit approval per `JUBO_SAFETY_RULES.md`; rehearse locally, Jason applies via dashboard |
| 2 | **SMS/Twilio safety and consent blockers** | 🟡 **Partially resolved (PR 2, held for review — code-only, no schema):** normalized opt-out matching (S1), Messaging-Service inbound fix (S3), status-webhook signature fix (S6), admin-gated Twilio credential write, A2P/consent guidance copy. **Still gated:** SMS consent model + send gate (S2, schema), auth-token read-exposure fix (RLS/schema), opt-out lifecycle/failed-send logging (S7/S8). Detail in `docs/JUBO_PR2_SMS_TWILIO_SAFETY.md` | **SMS-behavior + auth-permission-gated** — held for review, no auto-merge |
| 3 | **Theme-day provisioning fix for new orgs** | ✅ **Resolved for future orgs (PR 3):** onboarding templates now provision Loan In Process + Inactive Loans (Tue), Pre-Approved (Wed), and VIPs (Fri) so a new org's Daily Call Log populates all five days; matcher extracted to a tested pure module, canonical mapping unchanged. Template-only — no existing org/board/record/matcher touched. **Existing template-provisioned orgs (if any) need the gated per-org backfill** in `docs/JUBO_PR3_THEME_DAY_PROVISIONING_FIX.md` §6; Medina/BOMAC unaffected | Future-provisioning + tests + docs |
| 4 | **Invite email flow** | Send invitation emails (provider decision needed), verify production auth SMTP, keep copy-link fallback | Email provider = **external integration — gated** |
| 5 | **Billing/seat model foundation** | Plan/seat schema, enforcement at the two membership choke points, `requireOrgPlan`, Stripe Checkout + webhook, manual-invoice fallback | **Schema + external-integration-gated** |
| 6 | **Error monitoring / support ops** | Minimal slice (Sentry + `(app)/error.tsx` + password reset) lands in the 30-day window as blocker B4/B5; full pass adds alert routing, vendor feedback visibility, support runbooks, audit-log table, CI | Monitoring vendor = external service; audit log = **schema-gated**; password reset touches **auth** |
| 7 | **Data export/offboarding** | Customer CSV export (records/fields/communications), org-offboarding/deletion runbook, retention decision | Export is read-only/safe; deletion path is **destructive-gated** |

Also required but outside the numbered list: **legal/compliance package**
(ToS, privacy policy, beta agreement — §6 B7, attorney-drafted; blocks the
first external org regardless of PR order) and, later, the **public marketing
site/waitlist** (after PRs 1–3 so the promise matches reality).

PRs 1–4 + the minimal slice of 6 + legal unlock private beta; PRs 5–7 unlock
paid beta; §20 unlocks public launch.
