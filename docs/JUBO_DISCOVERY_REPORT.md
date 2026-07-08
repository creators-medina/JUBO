# Jubo Discovery Report — verified technical findings (Phase 0)

Read-only audit performed before the Daily Call Log / Greatness Tracker / Business Plan Math
build. Everything below was verified against the codebase; live-data caveats are flagged.

## Prospecting Dashboard (→ Daily Call Log)

- Route: `app/(app)/prospecting/page.tsx`
- Cockpit UI: `features/prospecting/themeday/ThemeDayCockpit.tsx` (hero, week strip, call
  list, Log Call dropdown, non-destructive Reset day)
- Data layer: `features/prospecting/themeday/queues.ts` (theme-day board rosters + the LO's
  week of call logs, bounded query)
- Theme config: `features/prospecting/coaching/themeDay.ts`
- Call-goal resolution: `features/prospecting/target/index.ts` — priority: active session
  target → onboarding profile answers ("Focus target") → goal engine → default
  (`DEFAULT_DAILY_CALL_GOAL = 25` in `features/prospecting/types.ts`; Phase 1 changes this
  to 10)
- The older full cockpit (`features/prospecting/cockpit/ProspectingCockpit.tsx` — sessions,
  momentum, coaching rail, scored queue) exists but is currently unrendered.

## Call-log storage

- **Backend and real** — `communication_logs` rows written by
  `quickCallOutcome(recordId, outcome)` (`features/communications/actions.ts`):
  `organization_id, record_id, created_by, channel='call', direction, outcome, occurred_at,
  follow_up_at`.
- **Per-LO via `created_by`; per-date via `occurred_at`; per-contact via `record_id`.**
  "Theme" is derived from the weekday, not stored.
- Dashboard completion = the signed-in user's real logs for the day. Reset-day/undo are
  per-browser localStorage overlays (`jubo-theme-day-reset:v1:<date>`) that hide logs from the
  dashboard view only — never destructive. A legacy per-weekday goal store
  (`jubo-theme-call-goals:v1`) exists and is currently read-only.

## Record ownership (per-LO feasibility)

- `records` has **`owner_user_id`**, **`assigned_user_id`**, and `created_by`.
- `assigned_lo` exists as an allowlisted common-field key; `resolveProducerUserId()`
  (`features/auth/guards.ts`) already resolves the producer for goal scoping.
- **Caveat:** ownership columns may be null on imported records (unverified live data).
- Safest v1: calls are accurately per-LO (`created_by`); record metrics scope per-LO where
  ownership exists, otherwise fall back org-wide with an explicit "All records" label.

## Board/stage/record model

`boards` → `board_groups` (stages) → `records` (`board_id`, `group_id`, `title`,
`record_type`, `status`, `priority`, `position`, `value`, ownership fields, `created_at`,
`updated_at`) → `fields` / `field_values` (typed dynamic fields). Moves go through
`moveRecord` (same-board stage change) and `moveRecordToBoard` (cross-board RPC; subitems,
history, and field values preserved) — never raw updates.

## Movement history — exists

- **`record_movements`**: `record_id, from_group_id, to_group_id, moved_by,
  movement_type ('stage_change' | 'board_change' | 'status_change' | 'assignment_change' |
  'manual'), metadata, created_at`. Written by the move RPCs; already read by the person card
  and workspace timeline.
- **Caveat:** covers in-app moves since the table existed. Imported records have no arrival
  movement — historical metrics need a created-in-board / current-state fallback and honest
  labeling for pre-import history.

## Real boards in this org

Prospecting · Past Clients · Realtors (Top 40) · Referral Partners · Initial Consult ·
Loan In Process · Closing · Inactive Loans · Pre-Approved · VIP's

- **No Funded board exists.** Funded = the funded/closed/post-closing **stage-name
  convention** (the `CLOSED_GROUP_WORDS` classifier already used by the Dashboard home),
  primarily inside the Closing board.
- **Pre-Approved board exists.** A pre-approval-named *stage* inside Work Loans boards may
  also exist — stages are live data, so detect by name match (`preapprov`) at runtime and
  count **distinct record_ids** across both.
- **Initial Consult is a board** — "New Lead" = movement into it (board_change), with
  created-in fallback for imports.
- Dashboard-home KPIs currently use `updated_at` as the funded-date proxy;
  `record_movements.created_at` is strictly better and should replace it in the Tracker.

## Metric feasibility

| Metric | Feasibility |
|---|---|
| Calls Made | ✅ Accurate, historical, per-LO (`communication_logs`) |
| New Leads | ✅ Historical via movements into Initial Consult + created-in fallback |
| Credit Pulls | ❌ Not tracked; future iSoft (Phase 6) |
| Pre-Approvals | ✅ Current-state now; historical via movements; dedupe by record_id |
| Deals in Pipeline | ✅ Current-state (Loan In Process roster); entries-over-time via movements |
| Funded Loans | ⚠️ Via funded/closed/post-closing stages (no Funded board); movements where available |

## Settings/storage

- **`onboarding_profiles`** (JSON `answers` + `focus_weights`) — best home for Business Plan
  Math assumptions; already read by the call-target resolver; read/write actions exist in
  `features/onboarding/actions.ts`. New keys in existing JSON = no schema change.
- **`production_goals`** (`target_units`, `target_volume`, `target_revenue`, `timeframe`,
  `producer_user_id`) — powers existing goals and the Dashboard home; the plan's outputs must
  reconcile with it (one canonical source for "target income/units").
- **localStorage** — established per-browser pattern; UI preferences only.

## Onboarding questionnaire

- `features/onboarding/questions/index.ts`, stored in `onboarding_profiles.answers`.
- Current steps: Welcome; Production (loans closed last year, volume, average loan size,
  monthly closings, team size); Goals (target closings/volume/income, monthly closings,
  bottleneck select); Business (lead-source booleans: self-source / realtor referrals / past
  clients / buys leads / recruiting; team structure); Focus (weighted areas).
- **Gaps for the production-plan intake:** gross comp bps, LO net split, per-source
  conversion rates, numeric lead-source mix (current source questions are booleans).

## Lead-source fields

- No stored lead-source data today. `lead_source` (and `referral_source`) exist as allowlisted
  **common-field keys** (`features/fields/commonFields.ts`), and the Monday-import auto-mapper
  maps source-like columns to them — but seeded templates don't create the field.
- Later build needs **no new tables**: provision a `lead_source` select field through the
  existing fields system + picker UI + a careful backfill plan (Phase 5).

## Risks / blockers

1. Ownership data quality on imported records (labeled fallback until verified/backfilled).
2. Movement-history gaps for imported records (created-in fallback + honest labels).
3. Funded definition depends on stage names in the Closing board — user should confirm which
   stages count as funded.
4. Pre-approval stage existence is runtime data — detect, don't assume.
5. `production_goals` vs plan assumptions overlap — Phase 3 must pick one canonical source.
