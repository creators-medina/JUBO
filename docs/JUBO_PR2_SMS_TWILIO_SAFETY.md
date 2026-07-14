# Jubo PR 2 — SMS / Twilio Safety and Consent

Fixes the critical SMS/Twilio readiness blockers from
`docs/JUBO_MARKET_READINESS_AUDIT.md` §11 before any external beta customer
texts through Jubo. Safety-and-correctness pass — **no marketing automation,
no bulk send, no autoresponders, no schema in this PR.**

**Status: HELD FOR REVIEW — do not auto-merge.** Includes SMS send-gating,
webhook behavior, and a Twilio-credential permission change (see §11).

---

## 1. Current SMS architecture

Per-org Twilio, each org brings its own credentials. Twilio config lives in
`integration_connections` (`provider='twilio'`, JSONB `config` =
`account_sid`, `auth_token`, `messaging_service_sid?`, `twilio_phone?`,
`inbound_enabled`, `outbound_enabled`). Threads
(`conversation_threads`, one active row per org+phone) group SMS; each message
is a `communication_logs` row (`channel='sms'`, `thread_id`). STOP suppressions
live in `opt_out_suppressions` (org + phone). Webhooks use the service-role
admin client and authenticate via the per-org Twilio signature. There is **no
bulk send, no workflow-triggered send, no scheduled send** — every outbound
message is human-initiated one-at-a-time through `sendSMS`.

## 2. Current outbound send path

`sendSMS` (`features/conversations/actions.ts:45`): `requireUserOrg` (any
member) → resolve phone (thread → input → record phone field) → **opt-out
check** (`isPhoneOptedOut`) → load Twilio config → `outbound_enabled` gate →
`sendTwilioSms` (REST, Basic auth, MessagingServiceSid or From) → log via
`recordSmsMessage` (find/create thread, insert log + timeline) → best-effort
`sms.sent` workflow. All UI composers (inbox, person card, Communicate tab)
funnel through this one function. Failed sends are not logged (documented gap).

## 3. Current inbound webhook path

`app/api/webhooks/twilio/inbound/route.ts`: 503 if admin creds missing → parse
form → require From/To/MessageSid → resolve org **by the To number**
(`findOrgByTwilioNumber`, last-10 match) → `inbound_enabled` gate → validate
Twilio signature with that org's token (timing-safe) → 403 on mismatch → STOP
detection → `opt_out_suppressions` upsert → match record by phone (org-wide
scan, ≤2000 rows) → `recordSmsMessage` (idempotent on MessageSid via app check
+ DB unique index) → best-effort `sms.received` / `conversation.unread`
workflows → TwiML ack.

## 4. Current status webhook path

`app/api/webhooks/twilio/status/route.ts`: 503 if admin creds missing → parse →
require MessageSid + status → find the `communication_logs` row by MessageSid →
load org Twilio config → validate signature → update `metadata.delivery_status`
/ `error` → best-effort `sms.failed` workflow.

## 5. Credential storage / access findings

- Twilio `account_sid` + `auth_token` are stored **plaintext** in
  `integration_connections.config` (JSONB).
- RLS (`20260528000000_phase17_integrations.sql:39-46`): **SELECT / INSERT /
  UPDATE = any org member**, DELETE = admin. So before this PR **any member
  could read the plaintext `auth_token`** via direct PostgREST SELECT, and
  **any member could overwrite the org's Twilio credentials**.
- The settings page redacts the token for the UI (server never sends it to the
  browser), but that is app-layer only — the DB policy still exposes it.
- Webhooks correctly use the service-role admin client (not member RLS).

## 6. Consent / opt-out findings

- **Opt-out exists** (`opt_out_suppressions` + STOP detection) but the outbound
  check matched **exact string** (`.eq('phone', phone)`), while suppressions are
  stored as Twilio's E.164 `From`. A record phone stored as `(212) 555-1234`
  would bypass a STOP from `+12125551234`. **Compliance-critical bug.**
- **No SMS consent model exists anywhere** — no consent flag, source,
  timestamp, or capture UI. (The only consent-named fields,
  `econsent_authorized` / `credit_pull_authorized`, are loan-document
  authorizations, unrelated to SMS.)
- No phone normalization was applied to the opt-out check or thread keying
  (`normalizePhoneDigits` existed but was unused on those paths).

## 7. Phone normalization strategy

Match phones the way the rest of the SMS layer already does
(`findOrgByTwilioNumber`, `matchRecordByPhone`): `normalizePhoneDigits` →
**last 10 digits**. `isPhoneOptedOut` now fetches the org's suppressions and
compares normalized last-10, so an opted-out contact is blocked **regardless of
how either the suppression or the record phone is formatted**. This is a
read-side fix only: **no stored phone data is mutated**, no schema is added.
`opt_out_suppressions` holds only opted-out numbers for an org, so the
org-scoped fetch is small; a normalized column + index is a documented future
optimization, not needed at beta scale.

Thread keying (`participant_phone`) still uses the stored format, so an
outbound-created thread and its inbound reply can still be two threads for the
same person until normalized — a **UX** issue, not a compliance one; left as a
documented follow-up (§11) to avoid touching stored thread/dedup data here.

## 8. Messaging Service inbound findings

Inbound org routing matched **only** `config.twilio_phone`. An org configured
with only a `messaging_service_sid` (no `twilio_phone`) would never match the
inbound `To`, so its inbound messages **— including STOP —** were silently
ack'd and dropped. Fixed: the inbound route now falls back to matching the
webhook's `MessagingServiceSid` against `config.messaging_service_sid`
(`findOrgByMessagingServiceSid`). Signature validation still runs against the
matched org's token. Settings copy now tells Messaging-Service orgs to set the
webhooks on the Messaging Service.

## 9. A2P 10DLC readiness findings

**None exists** — no brand/campaign registration, storage, or (previously) any
customer-facing guidance. Not built here (out of scope, and each org brings its
own Twilio account so registration is theirs). **Added:** a compliance guidance
panel on Settings → Communications stating A2P 10DLC registration is the
customer's responsibility before texting, that only consented contacts may be
texted, and that opt-outs are auto-honored. **Required before external texting
(gated / customer-side):** each org must register Brand + Campaign; Jubo should
later surface carrier error codes (30034/30007) meaningfully — documented as a
follow-up.

## 10. What was fixed in this PR

| # | Fix | File(s) | Behavior change |
|---|---|---|---|
| 1 | **Opt-out matching is now format-robust** (normalized last-10) | `features/conversations/queries.ts` | Blocks more (correctly) — never sends to an opted-out number under any format |
| 4 | **Messaging-Service inbound no longer dropped** (SID fallback) | `queries.ts`, `app/api/webhooks/twilio/inbound/route.ts` | Inbound + STOP now recorded for MS-only orgs |
| 6 | **Status webhook always signature-validated** (reject when config missing) | `app/api/webhooks/twilio/status/route.ts` | Spoofed status updates for deconfigured orgs now rejected (403) |
| 3 | **Twilio credential write is admin-only** | `features/conversations/actions.ts`, `CommunicationsSettingsClient.tsx` | Members can still send/receive; only admins can change the connection |
| 5 | **A2P 10DLC + consent guidance** in settings | `CommunicationsSettingsClient.tsx` | Copy only, no behavior change |

No schema, no migration, no data mutation, no provider change. Inbound
signature validation was **not** weakened.

## 11. What remains gated / follow-up

- **SMS consent model (schema — gated).** No consent data exists; Jubo must not
  fabricate it. **Beta-safe decision for now:** enforce opt-out (done), and do
  **not** block on unknown consent — blocking-on-unknown would halt all existing
  production texting since there are zero consent records, and a warn-only table
  with no capture UI would be dead data. **Proposed minimal follow-up (needs
  approval — schema + UI):**
  - a per-contact consent record: `sms_consent_status` (`unknown` | `granted` |
    `revoked`), `consent_source` (import | manual | inbound-reply | web-form),
    `consent_at`, `opted_out_at`, `normalized_phone` (last-10), org-scoped, RLS
    member-select / admin-or-owner-write;
  - a consent import mapping + a one-click "mark consented (with source)" on the
    contact card;
  - `sendSMS` gate: **phase 1 warn** when consent is `unknown` (send allowed,
    UI flags it), **phase 2 block** once orgs have captured consent. STOP always
    blocks regardless.
- **Twilio auth-token read exposure (RLS/schema — gated).** Admin-gating the
  write does not stop a member from reading the plaintext token via direct
  SELECT. The proper fix — restrict `integration_connections` SELECT (or the
  token column) to admins and route sending through a SECURITY DEFINER path so
  non-admin members can still send — needs a schema/RPC change and is deferred
  (also flagged in the multi-tenancy audit as B6). Encryption-at-rest is a
  further follow-up.
- **Thread de-duplication by normalized phone (data/UX).** Normalize
  `participant_phone` keying so inbound/outbound don't split; touches stored
  thread data and dedup semantics → separate reviewed PR.
- **Opt-out lifecycle completeness.** START/UNSTOP re-opt-in, HELP auto-reply,
  opt-out confirmation message, in-UI opted-out indicator before composing, a
  manual opt-out control, and an audit trail for suppression deletions — none
  built here (avoid autoresponder complexity per scope). Documented for a later
  pass.
- **Failed-send logging + Twilio error-code mapping**, and requiring the status
  callback URL env in production — follow-up.

## 12. Production runbook

**None required — this PR ships no schema, no migration, and no production SQL.**
All fixes are application code deployed by the normal Vercel build. The only
operational note: orgs using a Messaging Service should confirm their inbound +
status webhooks are set on the Messaging Service (surfaced in the settings copy).

## 13. External beta readiness status after PR 2

**Partially resolved.** The compliance-critical correctness gaps are closed:
opt-outs are now honored across phone formats, Messaging-Service inbound/STOP is
no longer dropped, status callbacks can't be spoofed, and credential changes are
admin-only. **Still required before external texting is fully safe:** the SMS
consent model (gated schema) and the auth-token read-exposure fix (gated
RLS/schema), plus each org completing A2P 10DLC registration. Recommended beta
stance until those land: SMS enabled only for orgs that attest consent and have
registered A2P, with the settings guidance visible.
