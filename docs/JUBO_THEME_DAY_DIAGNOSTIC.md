# Jubo — Daily Call Log Theme-Day Diagnostic (admin-only, read-only)

An in-app tool to answer "why did/didn't this contact appear in a given Daily
Call Log theme day?" without running SQL in Supabase. **Read-only, admin-only,
current-org only.** No schema, no service-role, no data changes, no Daily Call
Log behavior change.

---

## Where it lives

`/settings/diagnostics/theme-day` — a direct route (not added to the main
sidebar to avoid clutter; the Settings hub isn't role-gated so no card was added
there). Admin/owner only: non-admins are redirected to `/settings`.

## How it reuses the real logic (no drift)

The decision-critical answers come straight from the **live** Daily Call Log
code, not a re-implementation:

- **`buildThemeDayData(orgId, userId)`** (the real roster builder) supplies the
  day's **effective source boards** (`days[weekday].boards`, already
  schedule-resolved) and the **final roster** (`days[weekday].items`). Whether a
  contact "appears" is literally their membership in that real roster.
- **`getProspectingSchedule`** supplies the effective schedule.
- **`DAY_BOARD_SPECS` / `squashBoardName`** (the real matcher) supply the
  playbook match and the Tuesday "includes Loan In Process / Inactive" check.

Only the human-readable **diagnosis label** is derived, by a small pure function
(`diagnoseClassify.ts`, unit-tested) that anchors its positive case on the real
roster membership — so it can never disagree with the live call list.

## What it shows per matching record

- **Identity:** title, record id, board name/id, stage/group name/id, org id,
  owner/assigned/created-by user ids.
- **Record checks (PASS/FAIL):** in-my-org, not-archived, status-active,
  top-level (no parent), no `do_not_contact` log, board matches the day's
  playbook, board in the effective source, qualifies pre-cap.
- **Roster/cap:** day roster total (pre-cap), estimated rank by title, within
  the 500 cap.
- **Day context:** effective schedule mode (playbook / any / off / boards),
  schedule source (user / org-default / none), whether user & org-default rows
  exist, effective source boards, missing playbook boards, and — for Tuesday —
  whether the source includes Loan In Process and Inactive Loans.
- **A single diagnosis badge**, one of: Should appear · Hidden by schedule
  override · Hidden because selected day is off · Hidden because board is not
  sourced for this day · Hidden by do_not_contact · Hidden because archived ·
  Hidden because status is not active · Hidden because child/sub-record · Hidden
  because past the 500 cap · No matching record found · Unknown.

## Security / privacy

- **Admin/owner only** — the page redirects non-admins (`isOrgAdmin`), and the
  server module calls `requireOrgRole('admin')` (defence in depth).
- **Current org only** — the authed cookie client (RLS) + explicit
  `organization_id` filters; no cross-org joins; **no service-role**.
- **Read-only** — every query is a `select`; nothing is written.
- **No secrets** — only records/boards/groups/communication-outcome/schedule
  metadata are read; no tokens, no message bodies, no raw SQL in the UI.

## How to check Takeya Oliver

1. Open **`/settings/diagnostics/theme-day`** (as an owner/admin).
2. Type **`Takeya Oliver`** (partial like `Takeya` works too), pick **Tuesday**,
   press **Diagnose**.
3. Read the **diagnosis badge** on her card, then the checks below it. The
   **Tuesday source** panel at the top shows whether Loan In Process is actually
   sourced for you.

### What each result proves

| Badge / signal | Proven cause |
|---|---|
| **Should appear** + all PASS | She's in the live roster — if the call list disagrees, hard-refresh `/prospecting`, confirm the Tuesday tab, and check the per-browser "reset day" overlay |
| **Hidden by schedule override** (mode = boards, board-in-source FAIL) | Your Tuesday is pinned to boards that exclude Loan In Process |
| **Hidden because selected day is off** (mode = off) | You turned Tuesday off in your schedule |
| **Hidden because board is not sourced** (playbook, board-matches-playbook FAIL) | Her board's name doesn't contain "in process"/"inactive" — she's on a differently-named board |
| **Hidden by do_not_contact** | A do-not-contact outcome is logged on her record |
| **Hidden because archived / status is not active / child** | The matching record flag (see the failing check) |
| **Hidden because past the 500 cap** (qualifies, within-cap FAIL; see est. rank) | Valid but sorted past row 500 — silent truncation |
| **No matching record found** | No record titled like that in your org |

## Testing status

The pure classifier is unit-tested (7/7). The page builds and the route is
registered. **Live behavior against production data was not exercised from the
build environment** (no authenticated session / prod DB here) — use the steps
above to run it against real data.

## Notes / limits

- The diagnosis reflects **your** user context (the schedule is per-user); the
  Day-context panel shows the schedule source so a per-user override is obvious.
- Rank is estimated by title comparison (matches the call list's `ORDER BY title`;
  exact ties may shift by a row).
- The tool is diagnostic only — it changes nothing. Fixing a cause (moving a
  record, editing a schedule, clearing a do-not-contact) is done through the
  normal app surfaces.
