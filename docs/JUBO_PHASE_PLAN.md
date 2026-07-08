# Jubo Phase Plan — Daily Call Log · Greatness Tracker · Business Plan Math

Each phase is one focused PR. Implement **only the requested phase**. Every phase inherits
`docs/JUBO_SAFETY_RULES.md`; per-phase gates below are additional. Phases 0–4 require **zero
schema changes**.

Shared validation for every phase: `npm run build` passes; `npx eslint` on touched files shows
zero NEW findings vs baseline; report what the user should manually verify on the Vercel
preview. Shared rollback: every phase is a squash-merged PR — rollback = revert that single
commit; no phase may perform an irreversible data change.

---

## Phase 0 — Master documentation ✅ (this PR)

- **Purpose:** Permanent repo-level plan so future tasks don't need pasted context.
- **Scope:** `CLAUDE.md` pointer + the five `docs/JUBO_*.md` files.
- **Allowed:** Documentation only. **Disallowed:** Any app behavior change.
- **Risks:** None. **Approval gate:** Auto-merge allowed (docs-only).

## Phase 1 — Daily Call Log cleanup + 10-call goal

- **Purpose:** Reframe the Prospecting Dashboard as the **Daily Call Log** and set the daily
  goal to 10.
- **Scope:**
  - Rename/reframe UI copy (page title, sidebar label if applicable) — no route change unless
    strictly necessary.
  - Default daily call goal → **10** (`DEFAULT_DAILY_CALL_GOAL` + the target resolver in
    `features/prospecting/target/index.ts`).
  - Make the daily goal **editable**: prefer `onboarding_profiles.answers` (a key the target
    resolver already reads); localStorage only if the profile path proves unsafe.
  - Preserve: theme days, board sourcing, Log Call behavior, real backend call logs, Reset
    day, all existing outcomes.
- **Disallowed:** Schema/migrations; changing the theme-day board mapping; fallback filling of
  short call lists (explicitly future); touching outcome behavior.
- **Risks:** Goal-source precedence (session/profile/goal) must stay coherent.
- **Approval gate:** Behavior change → open PR and **hold for approval** unless the user
  explicitly authorizes a closed loop for the task.

## Phase 2 — Greatness Tracker v1

- **Purpose:** Read-only scoreboard below the Daily Call Log.
- **Scope:**
  - Server aggregation (read-only): Calls from `communication_logs`; New Leads from
    `record_movements` into Initial Consult + created-in fallback; Pre-Approvals from the
    Pre-Approved board + runtime-detected pre-approval stages, deduped by record_id; Deals in
    Pipeline from Loan In Process; Funded from funded/closed/post-closing stages (movements
    where available); Credit Pulls = "Coming soon / Not tracked yet".
  - Week-based window first; structure the aggregation so Today/Month/Quarter/Year can follow.
  - Per-LO where ownership is reliable; otherwise the "All records" labeled fallback.
- **Disallowed:** Any writes; fake metrics; new tables; lead-source splits (Phase 5).
- **Risks:** Import-era history gaps (label honestly); query cost (bound every query, follow
  the memoization lesson from the PR #50 freeze).
- **Approval gate:** Behavior change → PR + hold, unless closed loop is granted.

## Phase 3 — Business Plan Math v1

- **Purpose:** Production Plan page/tab: editable assumptions → required activity.
- **Scope:**
  - Assumptions stored as new keys in `onboarding_profiles.answers` (existing JSON — no
    schema): annual net comp goal, average loan amount, gross bps (default 275), LO net split
    (default 80%), net bps (derived ~225, editable), lead-source mix, per-source conversions.
  - Pure calculation module (unit-testable math, no data fetching inside it): goal → funded
    units → pipeline → pre-approvals → leads → calls, per source mix.
  - Reconcile with `production_goals`: decide and document ONE canonical source for target
    income/units so numbers never contradict; feed the daily call goal used by Phase 1.
- **Disallowed:** Schema/migrations; changing `production_goals` semantics silently.
- **Risks:** Two goal sources drifting (the reconciliation decision is the core of this phase).
- **Approval gate:** Behavior change → PR + hold, unless closed loop is granted.

## Phase 4 — Onboarding questionnaire update

- **Purpose:** Collect the production-plan inputs during onboarding.
- **Scope:** New question keys in `features/onboarding/questions/index.ts` writing to
  `onboarding_profiles.answers` (same keys Phase 3 reads): annual income goal, desired
  closings, average loan amount, gross bps, LO split, current production, current closings,
  current + desired lead-source mix, realtor partners, past clients, online leads/month,
  daily call goal, target markets, team/support capacity.
- **Disallowed:** Schema/migrations; breaking existing onboarding flows or stored answers.
- **Risks:** Key naming must match Phase 3 exactly (define the key list in one shared module).
- **Approval gate:** Behavior change → PR + hold, unless closed loop is granted.

## Phase 5 — Lead-source field / picker / reporting

- **Purpose:** Real lead-source attribution.
- **Scope:** Provision a `lead_source` select field through the **existing fields system**
  (the `lead_source` common-field key already exists); picker UI on records; source-attributed
  Tracker splits; a careful, explicitly-reviewed backfill plan.
- **Disallowed:** New tables without explicit approval; silent backfills — any bulk data
  write is a **stop-for-approval** step even though the fields system is existing schema.
- **Risks:** Backfill correctness; field provisioning across many boards.
- **Approval gate:** Field provisioning plan and any backfill require explicit user approval
  before execution; PR + hold regardless.

## Phase 6 — iSoft credit-pull integration

- **Purpose:** Make Credit Pulls trackable.
- **Scope:** External integration — requires integration design, storage decision, and a
  security review FIRST.
- **Approval gate:** **Do not implement until separately and explicitly requested and
  approved.** Everything about this phase is stop-for-approval.

---

## Cross-phase gates (restated)

- Phases 0–4: no schema changes, ever.
- Phase 5: existing fields system only; new tables and any backfill need explicit approval.
- Phase 6: explicit approval required before any work.
- Any schema / migration / live-data / backfill / auth / permission / destructive change stops
  for approval regardless of phase.
