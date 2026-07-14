# Jubo Operator + Code Audit (Step 1 — audit only, nothing changed)

A practical audit of Jubo as a working mortgage LO / team lead / admin would use it daily.
Findings are grounded in the codebase as of `fc9e807` (post PR #74). **No code, behavior,
schema, or data was changed by this audit.**

---

## 1. Executive Summary

**Overall state.** The core LO loop is genuinely good now: open Daily Call Log → see today's
themed list → call → Log Call → outcome lands in `communication_logs` → ring/streak/Verified
Results update. The contact card opens at the top with Quick Contact (call/text/email/log
call). Plan math is pure and tested. The app's weaknesses are not missing features — they are
**too many overlapping surfaces, two sources of truth for key numbers, and real user data
living only in localStorage**.

**Biggest usability risk.** Three "what do I do today" front doors (Dashboard home, `/today`
daily-actions cockpit, `/prospecting` Daily Call Log) plus two business-plan pages
(`/business-plan` legacy vs `/production-plan` canonical). A new LO cannot tell which page is
the real one, and the two plan pages can show **different income goals**.

**Biggest data-trust risk.** The Dashboard home computes "funded" as *records sitting in a
closed stage whose `updated_at` falls in the window* (a proxy), while Verified Results uses
*movement-dated entries into funded stages*. The same LO can see two different funded counts
on the same day. Secondary: per-LO vs "All records" scoping flips wholesale based on
ownership-data completeness, and pre-import history is absent from movement-based metrics
(labeled on the Tracker, **not labeled on the Dashboard KPIs**).

**Biggest technical risk.** (a) The manual Greatness Tracker's weekly entries exist only in
per-browser localStorage — an LO who switches devices silently loses their scoreboard.
(b) `boards.position` is missing in production — sidebar board reordering can't persist and
logs handled 400s. (c) Duplicated core logic: the funded/closed word list, Monday-week
helpers, and calls-counting each exist in 2–4 places. (d) Two giant components
(`BoardDetailClient` 1,093 lines with 42 baseline lint errors; `PersonFileCard` 930 lines)
plus a 600-line **dead** component (`ProspectingCockpit`, unrouted).

---

## 2. Top 10 User-Facing Problems

| # | Problem | Where | Why it matters | Recommended fix | Risk | Complexity |
|---|---|---|---|---|---|---|
| 1 | Two business-plan pages with potentially different income goals | Sidebar: `/business-plan` (coaching engine + `production_goals`) vs `/production-plan` (canonical `production_plan_*`) | An LO who edits the Production Plan still sees old numbers on Business Plan → trust damage | Short term: relabel legacy link "Business Plan (legacy)" or hide it; long term: one page reading the canonical source (goal-write consolidation is gated) | Med | Medium |
| 2 | Three "today" surfaces | `/dashboard` theme card, `/today` (daily-actions engine, streaks, attention views), `/prospecting` (Daily Call Log) | Splits the daily habit; duplicate streaks/queues confuse "which number is real" | Decide the canonical front door (recommend Daily Call Log), fold `/today`'s unique pieces (follow-ups due, attention views) into it over time; start by cross-linking clearly | Med | Large |
| 3 | Daily Call Log page is very tall | `/prospecting`: hero (playbook/ring/next-up/manual tracker) + week strip + call list + Verified Results + Manual vs Verified + Lead Source Breakdown | The actual call list — the point of the page — can sit below the fold | Collapse Verified Results/Breakdown by default (Manual vs Verified already collapses); consider moving Verified Results to a tab or the Dashboard | Low | Medium |
| 4 | Cryptic goal-source label | Cockpit goal editor `title` shows "Focus target"/"Goal target"/"Default target" | LO can't tell why the goal is 10 vs another number | Plain-language labels ("From your profile", "From your production goal", "Default") | Low | Small |
| 5 | Board money totals not verified consistent | Sidebar "Work Loans Pipeline $101K" vs per-board header totals vs Dashboard pipeline bars | Three surfaces sum loans with subtle rules (open-stage exclusion, loan-amount resolver); any mismatch reads as a bug | One shared "pipeline total" helper + an explicit audit that all three agree | Med | Medium |
| 6 | Lead-source select options differ by surface | Existing boards' template field has the legacy 6-option list; the card picker offers the canonical 15 | Editing from the board grid offers different choices than the card → inconsistent stored values | Approved, gated option-list refresh on existing `lead_source` fields (config update on live rows); until then the card picker is the blessed path | Med | Small (but **gated**) |
| 7 | Generic record card buries contact info | `PersonFileCard` generic shape: "Record summary" lists first 12 fields unordered | Phone/email can appear anywhere in the list (Quick Contact mitigates the actions, not the info) | Order the summary: phone/email/lead source first | Low | Small |
| 8 | Cross-board drag is invisible until tried | Board → sidebar drag with stage flyout works, but nothing hints it exists | Powerful feature goes unused | One-time hint chip on first record drag ("Drop on a board in the sidebar to move") | Low | Small |
| 9 | Manual vs Verified "Needs review" wording still reads negative at a glance | GreatnessTracker comparison chips | LOs may treat rust-colored chip as an error despite the footnote | Neutral chip color for Needs review; keep the copy | Low | Small |
| 10 | Weekend behavior implicit | Daily Call Log defaults weekends → Monday theme with no explanation | Saturday user sees "Monday · Realtor Calls" and wonders if the app is wrong | One-line eyebrow note on weekends ("Weekend — showing Monday's plan") | Low | Small |

## 3. Top 10 Technical / Data-Trust Problems

| # | Problem | Where | Why it matters | Recommended fix | Risk | Complexity |
|---|---|---|---|---|---|---|
| 1 | Two funded definitions | `features/dashboards/overview/queries.ts` (updated_at proxy) vs `features/prospecting/greatness/queries.ts` (movement-dated) | Same-day disagreement between Dashboard KPIs and Verified Results | Port the movement-based definition into the overview (read-only change; KPI numbers will shift — say so in the PR) | Med | Medium |
| 2 | Manual tracker data is localStorage-only | `manualTracker.ts` / `WeeklyActivityGrid` | Real weekly business data lost on device switch/clear | Approved backend table (per user/week) + migration of the read/write hook — **gated** | Med | Medium (**gated**) |
| 3 | `boards.position` missing in production | Sidebar board reorder; handled 400s in console | Reordering never persists; console noise erodes confidence | The already-flagged migration — **gated** | Low | Small (**gated**) |
| 4 | Duplicated core logic | `CLOSED_GROUP_WORDS` (overview + greatness), Monday-week helpers (queues/greatness/overview/manualTracker), calls-counting (cockpit client scan vs greatness head-counts) | Definitions can drift apart silently — the exact bug class in #1 | Extract `features/metrics/` shared module (closed-stage classifier, week starts); pure refactor | Low | Small |
| 5 | Giant components | `BoardDetailClient` 1,093 lines / 42 baseline lint errors; `PersonFileCard` 930 lines | Every change risks regressions; lint baseline hides new issues in the noise | Split into subcomponents opportunistically; burn down the 42 findings | Low | Large (incremental) |
| 6 | 600 lines of dead code | `features/prospecting/cockpit/ProspectingCockpit.tsx` (unrouted) + legacy `jubo-theme-call-goals:v1` read path | Costs a prop-thread on every ThemeDayCockpit change (it did in Phases 1–2); confuses newcomers | Delete it (git history preserves it); drop the legacy localStorage read | Low | Small |
| 7 | Unbounded query | `queues.ts` last-contact fetch (`communication_logs .in(recordIds)` with **no limit**) | A contact-heavy org could pull thousands of rows per page load (PR #50 lesson was about exactly this class) | Bound it (or aggregate server-side per record) | Low | Small |
| 8 | Dashboard KPIs lack the honesty labels the Tracker has | Overview "new leads" = created-in-window on non-pipeline boards; funded proxy; no pre-import caveat | Tracker is honest, Dashboard isn't — inconsistent trust posture | Add the same footnote pattern after fixing #1 | Low | Small |
| 9 | Per-LO scoping flips wholesale | greatness `scopeAndCount`: one ownerless record → entire metric becomes "All records" | Chip explains it, but the number can jump between weeks when one import lands | Phase-A-style ownership coverage report first; then decide (e.g., per-LO among owned + explicit unowned count) | Med | Medium |
| 10 | localStorage key sprawl | 9+ key families (`jubo-sidebar-*`, `jubo-theme-day-reset`, `jubo-greatness-tracker`, `jubo-board-view-mode`, `jubo-manual-vs-verified`, legacy call-goals…) | No registry; versioning/cleanup ad hoc | One `lib/localKeys.ts` registry with version constants | Low | Small |

## 4. Quick Wins (low-risk, soon)

1. Delete dead `ProspectingCockpit` + its unused imports and the legacy call-goals read (unblocks future cockpit changes).
2. Extract shared closed-stage words + week-start helpers into one module; point all four consumers at it.
3. Bound the `queues.ts` last-contact query.
4. Copy pass: goal-source labels (#2.4), weekend note (#2.10), neutral Needs-review chip (#2.9).
5. Relabel the sidebar's legacy "Business Plan" link (or move it under Setup) until consolidation.
6. Order the generic card's Record summary (phone/email/source first).
7. `lib/localKeys.ts` registry.

## 5. Must-Fix Workflow Issues (daily LO impact)

- **One front door for the day** (#2.2) — even step one (clear cross-links + naming) helps.
- **One funded number** (#3.1) — the single highest trust payoff.
- **Daily Call Log height** (#2.3) — the call list must be reachable in one glance.
- **One income goal** (#2.1) — at minimum stop presenting the legacy page as a peer.

## 6. Approval-Gated Items

| Item | Gate |
|---|---|
| Manual-tracker backend persistence (new table) | Schema |
| `boards.position` production migration | Schema/migration |
| Lead-source option-list refresh on existing fields | Live field-config update |
| Historical lead-source backfill (see `JUBO_LEAD_SOURCE_BACKFILL_PLAN.md`) | Bulk data writes |
| `production_goals` ↔ `production_plan_*` consolidation (writes/semantics) | Data semantics + writes |
| iSoft credit integration (Phase 6) | External integration + security review |
| Any per-LO ownership backfill arising from #3.9 | Bulk data writes |

## 7. Recommended 10-Step Fix Roadmap

| # | Task | Problem → Fix | Files/areas | Risk | Complexity | Schema? | Prod data? | Auto-merge? |
|---|---|---|---|---|---|---|---|---|
| 1 | Quick-wins bundle | Items in §4: dead code, shared constants, query bound, copy pass, key registry | `prospecting/cockpit/*` (delete), new `features/metrics/`, `queues.ts`, cockpit labels, Sidebar label | Low | Small | No | No | Yes |
| 2 | Unify funded/new-leads definitions | Dashboard overview adopts movement-dated funded + labeled leads (#3.1, #3.8) | `dashboards/overview/queries.ts` (+ reuse greatness helpers) | Med | Medium | No | No | Yes, with clear PR note that KPI numbers shift |
| 3 | Daily Call Log condensation | Verified Results + Breakdown collapsed by default; section order review (#2.3) | `GreatnessTracker.tsx`, prospecting page | Low | Small | No | No | Yes |
| 4 | Pipeline-total consistency | One shared pipeline-total helper; verify sidebar/board/dashboard agree (#2.5) | boards sidebar section, board header, overview | Med | Medium | No | No | Yes after verification |
| 5 | Generic card info ordering + drag hint | #2.7 + #2.8 | `PersonFileCard`, board drag start | Low | Small | No | No | Yes |
| 6 | IA step 1: business-plan de-duplication | Legacy page relabeled/demoted; `/production-plan` becomes the linked plan surface (#2.1) | Sidebar, `/business-plan` page banner | Med | Small | No | No | Hold (product decision — needs your sign-off on wording) |
| 7 | IA step 2: today-surface consolidation plan | Doc + first merge of `/today` uniques into Daily Call Log (#2.2) | prospecting page, today page | Med | Large | No | No | Hold |
| 8 | Phase A lead-source + ownership coverage report | Read-only report powering #3.9 and the backfill plan | new read-only report (script/page) | Low | Medium | No | No (read-only) | Yes |
| 9 | Board/PersonFile component split + lint burn-down | #3.5, incremental | `BoardDetailClient`, `PersonFileCard` | Low | Large | No | No | Yes per slice |
| 10 | Gated batch proposal | One doc proposing: manual-tracker table, `boards.position` migration, lead-source option refresh | docs + (on approval) migrations | Med | Medium | **Yes** | Yes (on approval) | No — explicit approval |

## 8. Suggested Next Prompt

Run **Roadmap Step 1 (Quick-wins bundle)** first: delete the dead cockpit, extract the shared
closed-stage/week helpers, bound the last-contact query, apply the copy fixes (goal-source
labels, weekend note, Needs-review chip color), relabel the legacy Business Plan link, order
the generic card summary, and add the localStorage key registry. It is one low-risk,
auto-mergeable PR that removes the most drag from every future change — and it clears the
ground for Step 2 (funded-definition unification), which is the single biggest trust fix.

---

### Area notes (supporting detail)

- **Daily LO workflow**: solid end-to-end post-#73/#74. Gaps: creating a follow-up task from
  the card takes composer-mode discovery; "find pre-approved buyers/past clients/VIPs" relies
  on sidebar board names (fine today, unlabeled for new users).
- **Contact card**: top action bar shipped (#73); scroll bug fixed (#74). Remaining: generic
  summary ordering (#2.7); Notes card `min-h-[16rem]` pads the right column; loan tabs
  (Borrower/Financial) unaudited against real data — worth a data-entry pass with the LO.
- **Boards**: view-mode memory shipped (#72). Kanban on phones is horizontal-heavy (see
  Mobile). Saved views exist but aren't surfaced on the board toolbar prominently.
- **Onboarding**: 9 steps is heavy but skippable; the Plan step duplicates two Production-step
  questions conceptually (loan size history vs planning value — intentional, labeled). If
  trimming: conversion rates stay out (already deferred), capacity questions could move to
  Production Plan later. No change urgent.
- **Admin/manager**: team page manages members/roles; producer scoping exists in goals. There
  is **no** per-LO rollup, team call leaderboard, or org onboarding progress view. Correctly
  waits until single-LO flows and per-LO data quality (#3.9) are settled.
- **Mobile**: tables all have `min-w` + `overflow-x-auto` (correct pattern). Watch: the
  contact-card modal on phones is one long column (usable, tall); Kanban on phones requires
  heavy horizontal scrolling (Table view is the practical mobile answer — view-mode memory
  helps); the manual tracker grid scrolls horizontally by design. No blocker found; a
  dedicated phone QA pass is still recommended before promoting mobile use.
