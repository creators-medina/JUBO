# Jubo 30-Minute Tester Feedback — Triage (audit + safe-fix pass)

Triage of Jason's 30-minute tester session. Part 1 (this document) sorts every
item into solved / bug / UX / gated. Part 2 (the same PR) implements ONLY the
low-risk Daily Call Log usability improvements (items marked **[shipped in
this PR]**). Everything else is a named follow-up. No CRM data, write paths,
schema, board sourcing, or destructive actions were touched.

---

## 1. Feedback summary

| # | Feedback | Verdict |
|---|---|---|
| 1a | Current day should be highlighted more clearly | UX — **[shipped in this PR]** |
| 1b | Explain where each theme day's list comes from | UX — partially existed (hero chips); **[shipped in this PR]** on the list itself |
| 1c | Easier to click a contact and call them | UX — **[shipped in this PR]** (`tel:` buttons) |
| 1d | Smoother "call next person" workflow | UX — **[shipped in this PR]** (Call on Next Up; guidance only) |
| 1e | Leave notes / affirm after a call | Already solved (Log Call outcomes; notes via the contact card) — documented below |
| 2 | Theme-day summaries + small scripts | UX — **[shipped in this PR]** (collapsible Call Script from existing playbook copy + clearly generic openers) |
| 3 | See previous Greatness Tracker weeks | **[shipped in this PR]** read-only history viewer (backend weeks + this browser's local weeks). Durable history already exists going forward — see §5 |
| 4a | Action Center "does not work right" | Needs repro — candidate causes documented (§9 of report / below) |
| 4b | Dashboard "does not work right" | Needs repro — candidates documented |
| 4c | Conversations "does not work right" / should feel like GHL | Needs repro + product direction — documented |
| 5 | Prospecting should default to Table view; unsure of board's purpose | Recommendation documented; no code change (see below) |
| 6 | Automations not understood | UX/copy recommendations documented; no behavior change |
| 7 | Contact card "passes through" states before the trifold | Real UX issue — root cause found; safest fix named as its own small PR |
| 8 | More Kanban editing incl. delete | Delete/archive **gated**; safe action-menu plan documented |

## 2. Already solved (tester may not have found it)

- **Log Call + outcomes after a call** — every call-list row and the Next Up
  card have the green Log call dropdown (six outcomes → real
  `communication_logs` rows). Notes live on the contact card (Notes wing and
  composer Note mode). No change needed; the new Call buttons sit next to Log
  call so the pair reads as one flow: *Call → Log call → (open card for notes)*.
- **Theme-day sourcing honesty** — the navy hero already shows "Pulled from
  <board>" chips (real matched boards; missing boards reported). The tester
  looked at the white list card instead, so this PR repeats a concise source
  line there.
- **Daily goal** — editable on the hero ring ("Daily goal 10 · edit"), saved to
  the existing `onboarding_profiles.answers.daily_call_goal` key.
- **Per-board view memory** — picking Table on any board already persists per
  user + board (`jubo-board-view-mode:v1:<user>:<board>`). Prospecting "default
  to table" is solved by clicking Table once — see §5 item below.

## 3. True bugs (need repro details before fixing)

None of the three "does not work right" pages has a reproducible defect
visible in code review — all three load, guard auth, and render real data.
What each needs from Jason: **what exactly looked wrong** (blank? slow? wrong
numbers? error toast?) plus the browser console output. Candidate causes:

- **Action Center (`/today`)** — runs heavy work ON PAGE LOAD before
  rendering: integration worker/scheduler kicks, throttled workflow scans,
  daily-action generation, progress snapshots. On a slow connection this can
  take seconds and feel broken. This is the same load-bearing background work
  the IA plan flagged (folding it into a real scheduler is the gated fix).
  Likeliest "doesn't work right" = slow first paint / stale-looking data.
- **Dashboard (`/dashboard`)** — heavy server aggregation; KPI definitions
  changed in Step 2 (movement-dated funded), so numbers may look "wrong" vs
  memory while being honest. Needs Jason's specific mismatch.
- **Conversations (`/conversations`)** — renders real threads from
  communication logs/SMS. With Twilio not connected or few threads it can look
  empty/inert. "Feel like GHL" (unified inbox, live thread view) is a product
  direction, not a bug — worth its own design pass once Twilio is live.

## 4. UX improvements (safe, this PR — Part 2)

All in `features/prospecting/themeday/ThemeDayCockpit.tsx` +
`features/prospecting/greatness/*`:

- **A. Stronger today highlight** — the true calendar day's week-strip card
  gets a red ring/border + tinted background in addition to the existing
  "Today" badge, independent of which day is selected.
- **B. Source explanation on the list card** — "Pulled from <real board
  name(s)>" under the list title, from the queue's matched boards (no query
  changes; missing boards keep their honest callout).
- **C. Collapsible Call Script** — a compact block on the list card: who
  you're calling + why (the existing theme `blurb`/`coaching` copy), the
  existing playbook guidance, and a short **clearly generic** suggested opener
  per day. Collapsed by default; zero new data.
- **D. Call buttons on rows** — every call-list row with a phone gets a
  compact `tel:` Call button beside Log call (disabled "No phone" state
  otherwise). Nothing is logged automatically; Log Call is unchanged.
- **E. Call next** — the hero Next Up card gets the same `tel:` Call button.
  No auto-advance, no auto-log, no data mutation — the queue order is
  untouched.
- **F. Greatness Tracker history (read-only)** — a "Previous weeks" section
  inside the tracker: pick a past week and see that week's totals, read-only.
  Weeks come from the `weekly_activity_entries` backend table (which has
  existed since batch PRs 10B/10C — durable history is already accumulating)
  merged with any weeks still only in this browser's localStorage. No writes,
  no schema.

## 5. Gated / destructive / schema-related

| Item | Why gated | Path |
|---|---|---|
| Kanban **delete** (and archive) | Destructive CRM data actions | Design a row/context action menu: Open · Move to stage · Move to board (all existing safe actions) + Archive/Delete behind explicit confirm — needs Jason's approval per the standing rules before any implementation |
| Greatness weekly summary/rollups beyond raw history | Fine to read, but manager rollups belong with the reporting phase | Read-only report later; table already exists |
| `/today` background work → real scheduler | Changes load-bearing triggers | Already documented in the IA consolidation plan (gated) |
| Conversations → GHL-style inbox | Product redesign + likely deeper Twilio integration | Own design phase |
| Referral Partners into Monday | Explicitly excluded per locked sourcing | Only on separate approval |

## 6. Recommended implementation order (after this PR)

1. **Contact-card direct-open** (small, high-feel): see §7-e below.
2. **Action Center / Dashboard / Conversations repro session** with Jason —
   10 minutes of "show me exactly what looked wrong" + console screenshot,
   then targeted fixes.
3. **Kanban action menu** (safe actions only) + separately-approved
   archive/delete proposal.
4. **Prospecting board decision** (product call, then 1-line change if any).
5. Conversations/GHL design pass (once Twilio live).

## 7. Exact next PRs

- **a. Daily Call Log improvements** — this PR (items A–F above).
- **b. Broken-page diagnostics** — no code until repro; then likely: `/today`
  slow-load mitigation (defer non-critical scans post-paint — careful, gated
  if triggers move), Dashboard copy/footnotes, Conversations empty states.
- **c. Greatness history v2** — optional: per-week comparison vs goals, and a
  manager view (reads the existing table; report-only PR).
- **d. Prospecting board** — recommendation: **no code**. Table view persists
  per board once picked (shipped #72). A hardcoded per-board default would
  special-case one board name; if Jason wants Table-first *everywhere new*,
  that's a one-line default change (`useState('table')`) — say the word.
  What it contains today: a general prospect/lead board; the Daily Call Log
  does NOT source from it (locked mapping uses Realtor/In-Process/Inactive/
  Pre-Approved/Past Clients/VIP boards), so it is not a duplicate — it's the
  raw lead pool. Decision needed from Jason: keep as lead inbox, or archive.
- **e. Contact-card direct-open** — root cause found: opening a record runs
  TWO sequential loads — `WorkspacePanel` first loads its own record bundle
  (client-side, ~9 queries) while showing a single-card skeleton, and only
  then mounts `PersonFileCard`, which starts its own `getFileCardData` load
  before the trifold appears. That skeleton→single-card→trifold morph is the
  "passes through multiple things" feel. **Safest fix (small PR):** mount
  `PersonFileCard` immediately (it already renders the header slot + its own
  loading state), so the trifold shell appears at once and fills in — no
  data-layer changes. A later optimization can merge the two loads.
- **f. Kanban actions** — current state: cards support open (click), drag
  between stages, cross-board drag to the sidebar, and title rename via
  right-click. No action menu exists; delete/archive don't exist anywhere on
  the board surface (safe by design). Plan: add a "⋯" menu with Open · Move
  to stage · Move to board (existing actions/dialogs only) in one PR;
  Archive and Delete come only as a separately-approved gated PR with
  explicit confirmation and permission checks.

## 8. Automations in Active Loans (item 6)

Automations appear as status-change side effects (phase 34 status
automations) with no in-context explanation. Recommendations (copy-only PR):
a small "What happens automatically" info popover on the board header where
automations are active, and plain-language labels in settings. No behavior
changes proposed.
