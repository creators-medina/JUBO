# Jubo PR 7 — Data Export / Offboarding Foundation

A safe, org-scoped, admin-only CSV export foundation plus a documented manual
offboarding process, so a brokerage owner can get a backup or leave with their
data. **Export only — no deletion, no destructive action, no schema.**

**Status: HELD FOR REVIEW** — it exposes a new admin data surface (an org-wide
CSV export). No auth-behavior change, no service-role, no message-body export,
no schema.

---

## 1. Current export / offboarding state

- **No org-wide export existed.** The only CSV download was a scoped internal
  report (`features/reports/LeadSourceCoverageClient.tsx` — client-side Blob of
  already-loaded lead-source aggregates). No record/notes/tasks/conversation
  export, no offboarding flow.
- **No deletion/offboarding behavior existed** anywhere (org/user/record delete
  paths intentionally absent).
- **Admin guards exist and are reused** (`requireOrgRole('admin')`, `isOrgAdmin`).
- **Files/attachments:** none — imports are parsed client-side and never stored
  (no Supabase Storage), so there are no attachments to export.

Answers: **What can be exported today?** Nothing org-wide (before this PR).
**Who can export?** Owner/admin only (this PR). **Org-scoped?** Yes — RLS +
explicit `organization_id` filters. **Cross-org risk?** None found (authed
client, no service-role, no cross-org joins). **Schema required?** No.

## 2. Export scope chosen

Three admin-only CSV downloads from **Settings → Organization**, each a
read-only server action scoped to the current org:

| Export | File | Contents |
|---|---|---|
| **Records** | `jubo-records.csv` | one row per active top-level record |
| **Record fields** | `jubo-record-fields.csv` | long-format: every field value (custom + common) |
| **Notes & tasks** | `jubo-notes-tasks.csv` | notes and tasks referenced to their record |

Conversations/SMS are **excluded** (see §4).

## 3. Data included

- **Records:** Board, Stage, Title, Status, Priority, Owner, Assigned To, Phone,
  Email, Value, Created At, Updated At. (Phone/email resolved from
  phone/email-typed field values for quick usefulness.)
- **Record fields (long format):** Board, Record, Field, Type, Value — this
  captures **all** custom and common field data generically (lead source, loan
  amount, appraised value, property address, next action, etc.) without
  special-casing any board's schema, so it never breaks on missing fields.
- **Notes & tasks:** Type, Board, Record, Content, Status (task Open/Completed),
  Due Date, Created By, Created At.

Empty orgs export a header-only CSV (no crash). Caps: 10k records, 50k field
values, 20k notes/tasks (documented; well above beta scale).

## 4. Data intentionally excluded

- **SMS / message bodies** (`communication_logs`) — message-body export is
  compliance-sensitive; **gated to a separate approved PR**. Not queried here.
- **Any secrets/tokens** — Twilio auth tokens, integration secret tokens, invite
  token hashes, auth/session tokens. Those tables (`integration_connections`,
  `organization_invitations`, etc.) are **never queried** by the export.
- **Other orgs' data** — impossible: authed client (RLS) + explicit
  `organization_id` filters, no cross-org joins, no service-role.
- **Archived records** (records export shows active; the fields/notes exports
  include all referenced records for completeness).

## 5. Permission model

Every export action calls `requireOrgRole('admin')` first (owner or admin) and
returns `forbidden` otherwise. The UI section renders only when `canEdit`
(owner/admin). Non-admins never see the buttons and cannot call the actions
successfully.

## 6. Security / privacy checks

- ✅ **Only owner/admin can export** — `requireOrgRole('admin')` on all three actions.
- ✅ **Non-admins cannot** — action returns `forbidden`; UI hidden.
- ✅ **Current-org only** — authed server client (RLS) + explicit
  `.eq('organization_id', orgId)` on org tables; child tables scoped by parent ids.
- ✅ **No tokens/secrets** — secret-bearing tables never queried.
- ✅ **No cross-org joins**, ✅ **no service-role** (uses the cookie-scoped client).
- ✅ **No mutation** — reads only.
- ✅ **No destructive action / no auto-offboarding** anywhere in this PR.
- ✅ **CSV-injection-safe quoting** — cells with `, " CR LF` are quoted/escaped
  (unit-tested).

## 7. Manual offboarding runbook

When a customer offboards, follow this **manual, non-destructive** process (no
automation ships in this PR):

1. **Confirm the request** in writing from an owner/admin of the org.
2. **Export the data** — Settings → Organization → Export your data → download
   Records, Record fields, and Notes & tasks CSVs. Deliver to the customer.
3. **Conversations/SMS** (if requested) — not yet self-serve; export is a gated
   follow-up. Until then, a message-body export requires an explicit, reviewed,
   admin-run action (see §8).
4. **Billing** — cancel/stop billing through whatever billing process is in
   place (billing itself is a separate gated workstream).
5. **Deactivate users** — Settings → Team → disable each member (existing
   `setMemberStatus('disabled')`; non-destructive, reversible). Do **not** delete.
6. **Retain, don't delete** — keep the org's data for a defined retention window
   (recommend ≥30 days) in case of reactivation or dispute. **No deletion in
   this PR.**
7. **Deletion later** — permanent org/data deletion must be a separate,
   explicitly approved, reviewed admin action with confirmation and an audit
   trail. It does not exist yet by design.

## 8. Remaining gaps

- **Conversation/SMS body export** — gated (compliance-sensitive); needs an
  approved, admin-run, clearly-scoped follow-up.
- **Single bundled download (zip / all-in-one)** — three separate CSVs today;
  bundling needs a zip dependency or a route handler (follow-up).
- **Streaming for very large orgs** — server actions return the full CSV string;
  fine at beta scale, but a streaming route handler would scale better past the
  caps.
- **Self-serve deletion / retention automation** — intentionally absent; gated.
- **Export audit log** — exports aren't recorded; an audit-log table (gated
  schema) is a later add.
- **Attachments** — none exist today; revisit if file storage is added.

## 9. External beta readiness after PR 7

**Resolved for the core need.** An owner/admin can now self-serve a complete,
org-scoped CSV backup of their records, all field data, and notes/tasks — "your
data is yours" — and there's a clear manual offboarding runbook. The remaining
items (§8) are enhancements (bundling, streaming, conversation export, and the
deliberately-gated deletion/retention automation), not private-beta blockers.
