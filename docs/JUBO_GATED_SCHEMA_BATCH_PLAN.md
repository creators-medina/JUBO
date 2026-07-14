# Jubo Gated Schema Batch Plan (Step 10 — proposal only, nothing implemented)

A design proposal for the backend/schema work that is currently blocked behind approval
gates. **Nothing in this document has been executed: no schema, no migrations, no scripts,
no data changes, no app-behavior changes.** Every item below is FUTURE work that Jason must
approve individually before implementation.

Read together with `docs/JUBO_SAFETY_RULES.md` (gates), `docs/JUBO_OPERATOR_AUDIT.md`
(§6 approval-gated items), and `docs/JUBO_LEAD_SOURCE_BACKFILL_PLAN.md` (Phases A–E).

---

## 1. Executive Summary

Five improvements are stuck behind gates because they touch schema, backend persistence,
live field configuration, or bulk data:

1. **Manual Greatness Tracker persistence** — real weekly business numbers live only in
   per-browser localStorage today. Switching devices or clearing the browser silently
   loses the scoreboard, and managers can never see it. Fix requires a new table.
2. **`boards.position` in production** — the migration already exists in the repo
   (`supabase/migrations/20260701000000_phase5l_boards_position.sql`) and the app already
   reads/writes `position`, but production never had it applied, so sidebar reordering
   never persists and the console logs handled 400s. Fix requires applying one additive
   migration.
3. **Lead-source option refresh** — boards provisioned before Phase 5 carry the legacy
   6-option list in `fields.config.options` while new surfaces use the canonical 15.
   Editing from an old board grid offers different choices than the card picker. Fix
   requires updating config JSON on live `fields` rows.
4. **Historical lead-source backfill** — planned in detail in
   `JUBO_LEAD_SOURCE_BACKFILL_PLAN.md`; execution is bulk data writes and stays gated.
   The Phase A read-only coverage report shipped in Step 8
   (`/settings/lead-source-coverage`) and is the mandatory baseline.
5. **Ownership cleanup** — the resolver falls back `owner_user_id` → `assigned_user_id` →
   `created_by` → unresolved, and one ownerless record flips whole Verified-Results
   metrics to "All records" scope. Fixing the data (assigning owners) is a bulk-write
   question that needs measurement and review first.

This document proposes the concrete shape of each item, an implementation order, a small-PR
sequence, and the exact questions Jason needs to answer. Approving this document approves
**nothing** — each PR in §7 still lands behind its own named approval.

---

## 2. Proposed Batch Items

### A. Manual Greatness Tracker Backend Persistence

**Current state (verified in `features/prospecting/greatness/manualTracker.ts`):**

- Values are a JSON grid `Record<activityKey, string[5]>` (Mon–Fri cells as strings,
  `''` = 0, sanitized to integers 0–999) stored under
  `jubo-greatness-tracker:v1:<userId>:<YYYY-MM-DD-of-Monday>` — one localStorage key per
  user per week.
- Nine fixed activity rows (product spec, goals sum to 30): `leads`, `credit`, `preapp`,
  `deals`, `fundings`, `events`, `videos`, `thank_yous`, `face_to_face`.
- Collapse state is a separate key. A same-tab store keeps Manual vs Verified live.
- Consequences: per-browser/device only, invisible to managers, gone on browser clear.
  Manual entries never touch CRM data (by design — that stays true after this change).

**Recommended table name: `weekly_activity_entries`.**
"Greatness Tracker" is a UI label that has already been renamed once (the automated
section became "Verified Results"); the table should be named for what it stores, not for
the current branding. `greatness_tracker_entries` is the fallback if Jason prefers the
product name in the schema.

**Recommended shape — one row per (org, user, week, activity):**

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK, `gen_random_uuid()` | |
| `organization_id` | `uuid` NOT NULL → `organizations` | org scoping, RLS anchor |
| `user_id` | `uuid` NOT NULL → `auth.users`/`profiles` | whose scoreboard |
| `week_start_date` | `date` NOT NULL | the week's **Monday**, same identity as `mondayKeyOf` (local-Monday `YYYY-MM-DD`) — key formats match localStorage exactly so the client can translate 1:1 |
| `activity_key` | `text` NOT NULL | one of the nine keys; validated in the app layer (no DB enum — the row list is product-owned and an enum would need a migration per change) |
| `monday_count` … `friday_count` | `smallint` NOT NULL DEFAULT 0, CHECK `BETWEEN 0 AND 999` | mirrors the UI's 0–999 clamp; `''` saves as 0 |
| `created_at` / `updated_at` | `timestamptz` NOT NULL DEFAULT `now()` | |
| `updated_by` | `uuid` NULL | audit: who last wrote (normally = `user_id`; differs only if admin editing is ever allowed) |

- **Uniqueness:** `UNIQUE (organization_id, user_id, week_start_date, activity_key)` —
  the natural key; upserts target it.
- **Indexes:** the unique constraint covers per-user reads;
  add `(organization_id, week_start_date)` for future team/week reporting.
- **Why row-per-activity beats a JSONB grid per week:** SQL-aggregatable for manager
  reporting (`SUM(...) GROUP BY user_id, activity_key`), per-cell CHECK constraints,
  no read-modify-write races between two tabs editing different rows, and adding an
  activity later is just new rows. A JSONB grid would be a 1:1 localStorage port but
  opaque to reporting — the main reason to move to a backend at all.

**RLS / access pattern:** follow the established org model
(`is_org_member(organization_id)` from the initial schema):

- `SELECT`: org members (team/manager visibility is the point of persistence).
- `INSERT`/`UPDATE`: own rows only (`user_id = auth.uid()`) — LOs write their own
  scoreboard; nobody edits someone else's. **Caveat from the repo's own history**
  (phase 8 goals engine): `auth.uid()` can be NULL inside RLS `WITH CHECK` during server
  actions, so writes may need the same SECURITY DEFINER RPC pattern used there. Decide at
  implementation time; both patterns already exist in this codebase.
- `DELETE`: not needed by the UI (cells go to 0, rows can stay); omit the policy.

**Reads/writes in the app:** the grid saves on the existing debounce/blur path — an
upsert of the changed activity row keyed by the natural key. Reads hydrate the week on
load. localStorage remains the offline/optimistic layer (see PR 10C in §7): render local
immediately, reconcile with the backend response, keep working local-only if the fetch
fails. The same-tab store and cross-tab storage event keep working unchanged.

**localStorage migration:** optional and one-shot, client-side, no script:

- On first load after the feature ships, if the backend has no rows for the current week
  but localStorage does, upload the current week automatically (it is the user's own
  data, written through their own authenticated session — not a bulk admin write).
- Past weeks: offer a one-time "Import past weeks from this browser" button (keys are
  enumerable by prefix). **Recommended: button, not automatic** — old weeks may exist on
  several devices with different values, and the user should pick the device that has the
  real numbers. Weeks never merged; a backend row always wins over local once it exists.
- If Jason prefers zero migration, old weeks simply stay local-only and history starts
  fresh — acceptable, since the tracker is a few weeks old.

**Collapse state:** stays in localStorage. It is a per-device UI preference, not business
data; persisting it server-side adds writes for no operational value.

**Future manager/admin reporting:** with org-member SELECT, a later (separately reviewed)
report can show per-LO weekly totals vs goals, team leaderboards, or feed the Manual vs
Verified comparison for managers — all read-only queries on this table. None of that is in
this batch; the schema just doesn't block it.

**Risks:** new writes from a page that previously never wrote (bounded: max 9 rows per
user-week, debounced); two-device conflicts (last-write-wins per activity row — acceptable
for a personal scoreboard, and far better than today's silent divergence); RLS mistakes
exposing rows across orgs (mitigated by copying the existing `is_org_member` pattern
verbatim and testing with a second org).

**Rollback:** the UI switch (PR 10C) ships behind a read-path fallback — reverting the PR
returns the app to localStorage-only with zero data loss (local copies keep being written
until the rollout is declared done). The table itself is additive; worst case it sits
unused. Dropping it would only ever happen after an explicit export.

---

### B. `boards.position` Production Migration

**Current state (verified):** the migration file **already exists in the repo** —
`supabase/migrations/20260701000000_phase5l_boards_position.sql` — and the app already
orders the sidebar by `position` and writes reorders
(`DynamicBoardsSidebarSection.tsx`). Production's `boards` table is missing the column,
so ordering falls back and reorder writes 400 (handled, but logged every time).

**Exact migration needed (already written, phase5l):**

1. `ALTER TABLE public.boards ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;`
2. Backfill: `ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at ASC) - 1`
   — i.e. **every existing board keeps its current display order**; nothing visibly moves
   until a user drags.
3. `CREATE INDEX IF NOT EXISTS idx_boards_position ON public.boards(organization_id, position);`

**Default/backfill strategy:** as written — created-at order within each org, matching
what users see today. No user decision needed beyond approving the run.

**Org scoping:** yes — position is per-organization (the backfill partitions by
`organization_id` and the index is `(organization_id, position)`); ordering is a shared
org-level layout, matching how the sidebar behaves now.

**Rollback:** `DROP COLUMN position` (and the index) restores the exact pre-migration
state — the app already handles the column's absence (that is today's behavior). No
records, groups, stages, or field data are involved at any point.

**Risk level: lowest in the batch.** Additive column with a deterministic backfill of a
presentation-only value, zero app-code changes required, revert is a column drop. The only
operational step is running the migration against production (standard Supabase migration
apply), which is itself the gate.

---

### C. Lead-Source Option Refresh

**Current state (verified in `features/fields/leadSourceActions.ts` and the backfill
plan):** options live in `fields.config.options` as
`[{ id: slugified-label, label }]` JSON on each board's `lead_source` field row. Legacy
template-provisioned boards may carry the 6-option list (`Self-Sourced`,
`Realtor Referral`, `Past Client`, `Purchased Lead`, `Website`, `Other`); Phase-5-era
provisioning writes the canonical 15 (`LEAD_SOURCE_LABELS`). The card picker offers the
15 everywhere and preserves any existing stored value; reports alias legacy values
display-only. **Stored values are `field_values.value_text` rows — an option-list refresh
does not touch them.**

**Recommended mechanism: a small admin action, not a SQL migration.**

- An admin-only, per-field action ("Refresh lead-source options to the canonical list")
  that rewrites `config.options` on a named `lead_source` field row — reachable from the
  Step 8 coverage report page, which already lists exactly which boards have the field.
- Why not a migration: the field rows are **live org data**, not schema; a migration
  can't be reviewed per-board or partially applied, and orgs created later would need it
  re-run anyway. An admin action is idempotent, board-by-board, logged, and reversible
  per field.
- Why not manual UI editing: editing 15 options by hand per board invites typos that
  create *new* non-canonical variants — the exact problem being fixed.

**How to avoid overwriting values:** by construction — only `fields.config` is written;
`field_values` rows are never read or written by the refresh. The select UI already
renders a stored value that isn't in the option list as the current value (verified
Phase 5 behavior: the picker preserves existing values), so no stored value is orphaned
invisibly.

**How to preserve legacy values:** union, not replace — the refreshed list is the
canonical 15 **plus** any currently-stored values on that board that aren't canonical
(kept as trailing options, so existing data stays first-class selectable). Display
aliasing continues to fold them in reports. Alternative (replace with exactly 15) is
simpler but makes legacy stored values un-reselectable after an accidental change —
recommend the union.

**Separation from attribution backfill:** strictly separate. The refresh changes what an
LO can *pick*; the backfill (item D) changes what records *have*. Different gates,
different rollback artifacts, different failure modes. The refresh should land first so
any manual attribution work (backfill Phase D) picks from the right list.

**Risks:** writing a malformed `config` JSON breaks the field's editor (mitigate: build
the new config from the fetched current config in code, snapshot the old JSON before
write, refuse to run on non-`lead_source` slugs); option-`id` churn (mitigate: keep the
same slugified-label id scheme `ensureLeadSourceField` uses; ids for unchanged labels stay
identical).

**Rollback:** per-field — the action stores the previous `config.options` JSON (in the
action log / a snapshot column of the report export) and a matching "restore previous
options" admin action writes it back. Values were never touched, so rollback is complete.

---

### D. Historical Lead-Source Backfill / Review

Fully specified in `docs/JUBO_LEAD_SOURCE_BACKFILL_PLAN.md` (Phases A–E). This batch
adds nothing to that plan; it schedules it. Summary of what stands:

- **Why not automatic:** source cannot be inferred from board, stage, theme day, or
  activity text without fabricating attribution — an empty source is honest, a guessed
  one is corrupted data (standing safety rule). Every inference path was explicitly
  rejected in the plan.
- **Baseline:** the Phase A read-only coverage report **shipped in Step 8**
  (`/settings/lead-source-coverage`, CSV export). Its export is both the work-list and
  the pre-change snapshot. No execution proceeds without Jason reviewing those numbers.
- **Safe aliases (script-appropriate, Phase C only):** exactly the Phase 5.1
  `SOURCE_ALIASES` list (`Website`→`Website Lead`, `Facebook`→`Facebook Ad`,
  `Realtor`→`Realtor Referral`, `IG`→`Instagram`, `Online`→`Online Lead`,
  `Friend`→`Personal Friend`, repeat/referral past-client phrasings). Nothing looser.
- **Ambiguous (never auto-mapped):** `Past Client`, `Self-Sourced`, `Purchased Lead`,
  generic `Referral`, and unknown import values (`Zillow`, partner names…). These keep
  their raw text and honest report rows.
- **Review queue UI over scripts:** recommended for everything except pure alias
  normalization — per-record writes go through the existing `upsertFieldValue` path
  (RLS-scoped, activity-logged, workflow-correct), there is no all-at-once failure mode,
  and rollback is "edit the record again". The queue is backfill Phase D: "Needs lead
  source", ordered funded → pipeline → pre-approved → recent; suggestions (from import
  files only) displayed but never pre-applied.
- **Approval gates before execution (unchanged from the plan):** A-report reviewed →
  B board list named → C mapping table + dry-run output + rollback CSV location + batch
  size + workflow-event decision approved → D ships as a normal reviewed PR → E only if
  Phase A proves import CSVs carried source columns.

---

### E. Ownership Cleanup

**Current state (verified in `features/reports/coverageShared.ts` and greatness
`scopeAndCount`):** the resolver walks `owner_user_id` → `assigned_user_id` →
`created_by` → unresolved. `created_by` is a fallback that often means "who imported
this", not "whose deal this is". When ownerless records exist inside a metric's
population, Verified Results flips that metric to "All records" scope (labeled with a
chip) — honest, but the number can jump between weeks when one import lands.

**How to measure (first, and already mostly built):** the Step 8 coverage report shows
the org-wide resolution mix (Owner / Assigned / Created-by fallback / Unresolved). Before
any cleanup, extend or export it to answer: how many records are `created_by`-only or
unresolved, **per board and per metric population** (funded YTD, open pipeline, recent
leads) — because those are the records whose ownership actually changes reported numbers.
That extension is read-only and needs no gate beyond a normal PR.

**Manual assignment UI — recommended:** a small "Needs owner" review queue (same pattern
as the backfill Phase D queue, possibly the same page), ordered by reporting impact
(funded → pipeline → the rest). Each assignment is one per-record update by a human
through the existing record-update path. For a solo-LO org this may be one afternoon of
clicking; that is fine and safe.

**Bulk owner assignment — allowed only in one narrow case:** if the measured data shows
the org effectively has a single producer (every resolvable record resolves to the same
user), a one-time "assign all unowned records on boards X, Y to user U" bulk update is
defensible. Requirements mirror backfill Phase C: dry-run listing every
`record_id, board, old → new`, CSV snapshot of prior values (all three ownership columns),
explicit approval of the exact count and board list, bounded batches. In a multi-producer
org, bulk assignment is **not** recommended — it would manufacture per-LO numbers.

**Risks of inferring owners:** attributing another LO's production to the wrong person
(comp/reporting damage), silently converting "All records" honesty into fake per-LO
precision, and workflow side effects if owner-change automations exist. Inference from
activity ("who called them most") is explicitly rejected — same standing rule as
lead-source inference.

**Approval gates:** (1) measured coverage numbers reviewed; (2) decision: manual queue
only vs single-producer bulk assign; (3) if bulk: dry-run + snapshot + named boards/count
approved; (4) any change to the *resolver semantics* (e.g. dropping the `created_by`
fallback from reports) is a separate, explicitly-approved metric-definition change —
it will move reported numbers and must say so.

---

## 3. Recommended Implementation Order

Audited recommendation — differs from the suggested order in one place: **`boards.position`
goes first**, because the migration is already written and reviewed in-repo, it is purely
additive with a deterministic backfill, the app code that uses it already shipped, and
rollback is a column drop. It is the cheapest possible rehearsal of the "apply a migration
to production" muscle before the batch's only *new* table lands.

1. **`boards.position` migration** (item B) — smallest, already written, zero app changes.
2. **Manual tracker backend persistence** (item A) — new table (additive, no existing data
   touched), then the UI switch with local fallback. Highest daily-user value in the batch.
3. **Lead-source option refresh** (item C) — admin action on live field config; wants the
   coverage report (shipped) as its target list. Landing before backfill work means manual
   attribution picks from the right options.
4. **Ownership review/cleanup** (item E) — read-only measurement extension, then the manual
   queue; bulk assign only if the single-producer case is proven.
5. **Historical lead-source backfill workflow** (item D) — last, per its own plan's gates;
   depends on C (right option list) and benefits from E (right owners) for the
   funded-first review ordering.

---

## 4. What Should Stay Out of This Batch

Explicitly excluded — none of these are proposed, scheduled, or implied here:

- **iSoft credit integration** (Phase 6) — external integration + security review, its own
  future proposal.
- **`production_goals` ↔ `production_plan_*` consolidation** — write-path and semantics
  change to goal data; separate proposal after the IA work settles.
- **Automatic lead-source inference** — permanently out, not just out of this batch.
- **Automatic owner inference** — same.
- **Any broad CRM rewrite** (fields-system redesign, board data-model changes, auth or
  permission model changes) — nothing in this batch requires or justifies one.
- Also out: folding `/today`'s background triggers into a real scheduler (IA-gated,
  unrelated to schema), and any Manual-tracker *admin editing* of other users' entries
  (schema allows adding it later; not proposed now).

---

## 5. Exact Approval Questions for Jason

Each maps to a PR in §7; answering these is the approval.

**A. Manual tracker persistence**
1. Approve creating table `weekly_activity_entries` (shape in §2A)? (Or prefer the name
   `greatness_tracker_entries`?)
2. Approve org-member **read** visibility (managers can see LOs' weekly grids)? If no,
   reads become own-rows-only and future team reporting is off the table until revisited.
3. localStorage history: automatic current-week import + a manual "Import past weeks"
   button (recommended), automatic everything, or no migration (start fresh)?
4. Confirm collapse state stays local-only (recommended).

**B. boards.position**
5. Approve applying the existing phase5l migration to production (additive column,
   backfill preserves today's visible order, index)?

**C. Lead-source option refresh**
6. Approve refreshing `config.options` on existing `lead_source` fields to the canonical
   15 **as an admin action per board** (recommended) rather than a one-shot migration?
7. Approve the **union** strategy (canonical 15 + any existing non-canonical stored
   values kept as selectable options) over hard replacement?

**D. Backfill (scheduling only — its own plan has its own gates)**
8. Confirm the backfill stays manual-review-first (queue UI; scripts only for the exact
   Phase 5.1 alias list, dry-run + CSV snapshot gated), or defer the whole item?

**E. Ownership**
9. Approve the read-only measurement extension (per-board / per-metric ownership
   resolution counts, exportable)?
10. Manual "Needs owner" queue only, or also allow the single-producer bulk assignment
    path (only if measurement proves one producer, with dry-run + snapshot approval)?

---

## 6. Risk Matrix

| Item | Data risk | Schema risk | User-facing risk | Rollback difficulty | Recommended approval level |
|---|---|---|---|---|---|
| B. `boards.position` migration | None (presentation value, deterministic backfill) | Low (additive column + index, already written) | None (order preserved until a drag) | Trivial (drop column; app already tolerates absence) | Single approval to apply |
| A1. Tracker table (schema only) | None (new table, nothing reads it yet) | Low-Med (new table + RLS policies) | None (no UI change in this PR) | Easy (unused table; drop after export) | Approve shape + RLS answers (Q1–2) |
| A2. Tracker UI switch | Low (user's own rows; last-write-wins across devices; local fallback keeps writing) | None | Low (same grid; worst case falls back to local) | Easy (revert PR → localStorage-only, no loss) | Approve migration answers (Q3–4) |
| C. Option refresh | Low-Med (writes live `fields.config`; values never touched; per-field snapshot kept) | None | Low (pickers gain options; stored values preserved) | Easy per field (restore snapshotted JSON) | Approve mechanism + union (Q6–7), then run per named board |
| E. Ownership manual queue | Low (per-record, human-confirmed, existing write path) | None | Low (numbers become *more* per-LO as records gain owners — labeled) | Per-record edits | Normal PR review (Q9–10) |
| E-bulk. Single-producer bulk assign | **High** if the single-producer premise is wrong | None | Med (per-LO scoping flips on for affected metrics) | Moderate (restore from pre-write CSV — itself a gated bulk write) | Explicit: dry-run + snapshot + exact count/boards |
| D. Backfill Phase C (alias script) | **High** class, tightly mitigated (alias-list-only, dry-run, CSV snapshot, batches) | None | Low (reports already alias these for display) | Moderate (CSV restore — gated bulk write) | Explicit per backfill plan §5 |
| D. Backfill Phases D/E | Low (per-record LO-confirmed; E is empty-only fills) | None | Low | Per-record / CSV | Per backfill plan §5 |

---

## 7. Suggested Implementation PR Sequence

Small, individually revertible PRs; each names its approval question(s) from §5.

| PR | Contents | Gate |
|---|---|---|
| **10A** | Apply `boards.position` (phase5l) to production. No code changes — the app already uses the column. | Q5 |
| **10B** | `weekly_activity_entries` migration only: table + constraints + indexes + RLS. No app code reads or writes it yet. | Q1–Q2 |
| **10C** | Tracker UI switches to backend read/write with localStorage as optimistic cache + offline fallback; automatic current-week import; "Import past weeks" button per Q3. Manual vs Verified reads through the same store. | Q3–Q4 |
| **10D** | Lead-source option refresh admin action (union strategy, per-field snapshot + restore) surfaced from the coverage-report page, plus the "refresh" audit trail. | Q6–Q7 |
| **10E** | Ownership measurement extension of the Step 8 report (read-only; per-board / per-metric resolution counts + CSV). | Q9 |
| **10F** | "Needs owner" manual review queue (per-record assignment via existing update path). | Q10 (manual part) |
| **10G+** | Backfill plan Phases B–E as separately gated work per `JUBO_LEAD_SOURCE_BACKFILL_PLAN.md` — provisioning, alias normalization script (dry-run first), "Needs lead source" queue, optional import re-attribution. | Q8 + backfill plan §5 |
| *(cond.)* | Single-producer bulk owner assignment — only if 10E proves the premise. | Q10 (bulk part) |

Every PR: build green, zero new lint findings, no behavior change outside the named
feature, and the standing rules — nothing inferred, nothing overwritten silently,
snapshots before any bulk write.

---

## 8. Suggested Next Prompt

*(Written as requested — **not** run. Use after answering §5 Q5.)*

> Begin Gated Batch PR 10A only: apply the existing `boards.position` migration
> (`supabase/migrations/20260701000000_phase5l_boards_position.sql`) to production.
> I approve the schema change: additive `position` column on `boards`, backfill by
> `created_at` order within each organization (preserving today's visible order), and the
> `(organization_id, position)` index. Do not modify the migration file, any app code, or
> any other table. Before applying, confirm the exact SQL that will run and the current
> production state (column absent). After applying, verify: sidebar order unchanged,
> drag-to-reorder persists across reload, and the reorder 400s are gone from the console.
> Report the verification results. Do not start PR 10B or any other batch item.

---

*Step 10 deliverable — proposal only. No schema, migrations, scripts, data changes,
auth/permission changes, integrations, or app-behavior changes were made.*
