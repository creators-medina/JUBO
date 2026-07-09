# Jubo IA / Navigation Consolidation Plan (Steps 6–7)

> **Status — step 1 IMPLEMENTED (label/order/copy only):** `/today` is relabeled
> **Action Center** (route + behavior untouched); the default utility order is
> **Daily Call Log · Action Center · Dashboard** (saved layouts still win);
> `/business-plan` keeps its route as **Business Coaching** (page heading aligned) with a
> banner pointing to the canonical **Production Plan**; no routes were removed, hidden, or
> redirected. Remaining items below (§8) stay gated.

Discovery for the operator audit's IA items (#2.1 two plan pages, #2.2 three "today"
surfaces). **Nothing is implemented here** — no routes, behavior, schema, or data changed.
Grounded in the codebase at `9b29bbf` (post Step 5).

---

## 1. Route inventory (`app/(app)`)

| Route | What it is | Linked from |
|---|---|---|
| `/dashboard` | Overview home: KPIs (unified funded), pipeline, theme card, closings, goal, activity, follow-ups | Sidebar (utility) |
| `/prospecting` | **Daily Call Log** — themed call execution + manual tracker + Verified Results | Sidebar (utility), Dashboard theme card, widgets |
| `/today` | **Daily-actions engine**: system-generated actions, pace vs production goals, stale/attention views, streaks, setup checklist, coach insights | Sidebar (utility), `/actions` redirect, `/onboarding/reveal` CTA, settings access-denied redirects |
| `/production-plan` | **Canonical Production Plan** (Business Plan Math; `production_plan_*` answers) | Sidebar (insights) |
| `/business-plan` | Legacy coaching view over `getCoachingSnapshot` (`production_goals`-driven); "Edit plan" → `/goals` | Sidebar (insights, relabeled **Business Coaching** in #76) |
| `/goals`, `/forecasts` | `production_goals` system (funnels, targets, forecasting) | Sidebar (insights), `/business-plan` |
| `/boards`, `/boards/[id]` | Board index + board pages | Sidebar boards section |
| `/actions` | Bare redirect → `/today` | Legacy deep links |
| `/conversations`, `/imports`, `/blueprints`, `/integrations`, `/settings/*`, `/profile`, `/dashboards/[id]` | As labeled | Sidebar / setup |

No dead routes found; `/actions` is a harmless legacy redirect.

## 2. Current sidebar structure

- **Utility (pinned):** Dashboard · Daily Call Log · Today
- **Boards section:** Work Loans Pipeline card (open-stage total, Step 4) · Generate · Work Loans · All Boards
- **Insights:** Business Coaching (`/business-plan`) · Production Plan · Goals · Forecasts
- **Setup:** Workflows · Imports · Blueprint Import · Integrations · Settings
- Per-browser drag layout (`useSidebarNavLayout`) — **default changes affect fresh browsers only; saved layouts win** (safe to reorder defaults).

## 3. Overlapping concepts found

1. **Three "what do I do today" surfaces.** Dashboard's theme card, `/today`, and the Daily
   Call Log all answer it partially. They even overlap data: `/today` shows callsToday/call
   goal (from prospecting), follow-ups due (also on Dashboard), its own daily-actions streak
   (distinct from the prospecting streak), and coach insights (shared with `/business-plan`).
2. **Two plan surfaces / two goal sources.** `/production-plan` (canonical, per the recorded
   Phase 3 decision) vs `/business-plan` + `/goals` + `/forecasts` (all `production_goals`).
   Income goals can differ between the two systems.
3. **Two streaks** (daily-actions vs prospecting) shown in different places with the same word.

**Critical dependency (why `/today` is NOT just a duplicate):** its server component *runs
work on load* — the integration worker + scheduler drain, workflow scans (30-min throttle),
idempotent daily-action generation, and the daily progress snapshot. It also hosts the
once-only plan-reveal gate. Hiding or removing `/today` without relocating those triggers
would silently stop integrations processing, stale scans, and action generation for users
who never visit it.

## 4. Recommended final navigation labels

- **Daily Call Log** (`/prospecting`) — first in the utility group; the daily front door.
- **Action Center** (`/today`, label-only rename) — generated tasks, pace, attention; stops
  competing with Daily Call Log for the "today" word.
- **Dashboard** (`/dashboard`) — the overview, third.
- **Production Plan** (`/production-plan`) — the one planning page.
- **Business Coaching** (`/business-plan`) — already relabeled; keep for now with an
  in-page pointer to Production Plan.
- Boards / Goals / Forecasts / Setup unchanged.

## 5. Recommended route treatment

| Route | Treatment |
|---|---|
| `/prospecting` | **Keep** (primary daily workflow). |
| `/dashboard` | **Keep** (overview). |
| `/today` | **Keep + relabel** ("Action Center"). Do NOT hide/remove now (background-job triggers + reveal gate + redirect targets). Long-term option (gated design work): fold its unique pieces into the Daily Call Log and move the on-load workers to a proper scheduled mechanism. |
| `/production-plan` | **Keep** (canonical plan). |
| `/business-plan` | **Keep, demoted**: label stays Business Coaching; add a small banner linking to Production Plan for planning math. **Redirect/retire later only after approval** and only once its unique pieces (execution score, coach notes, plan reveal content) have a home. |
| `/actions` | **Keep** (redirect; free). |
| `/goals`, `/forecasts` | **Keep**; optionally group with Production Plan under a "Planning" heading later (cosmetic). |

Nothing needs deleting; nothing is safe to hide from the sidebar today except *optionally*
demoting Business Coaching's default position (saved layouts unaffected).

## 6. Product decisions needed from Jason

1. **`/today` label:** approve "Action Center" (or propose another name).
2. **Default utility order:** Daily Call Log first, then Action Center, then Dashboard?
3. **`/business-plan` endgame:** keep indefinitely as coaching, or plan a later migration of
   its unique pieces into Production Plan/Action Center and then redirect (gated).
4. Optional: group Production Plan + Goals + Forecasts under a "Planning" sidebar label.

## 7. Low-risk implementation PR (after decisions — auto-mergeable)

One UI/copy PR: relabel `/today` in `NAV_LINKS`; reorder `DEFAULT_GROUP_ITEMS.utility` to
put Daily Call Log first (fresh browsers only); add the Business Coaching banner ("Planning
your year? The Production Plan is the canonical Business Plan Math page →"); optionally add
an "Open Daily Call Log" cross-link on `/today` if it lacks one. No routes, data, or
behavior change.

## 8. Gated / high-risk items (explicit approval each)

- Folding `/today` into the Daily Call Log (moves the on-load background-job triggers —
  needs a scheduling design first; the page-load-triggered workers are standing tech debt).
- Redirecting/retiring `/business-plan` (route behavior change).
- `production_goals` ↔ `production_plan_*` write/semantics consolidation (from the audit).

## 9. Suggested next implementation prompt

> Implement IA consolidation step 1 per `docs/JUBO_IA_CONSOLIDATION_PLAN.md` §7: relabel
> `/today` to "<chosen name>", set the default utility order to Daily Call Log · <today> ·
> Dashboard, and add the Business Coaching → Production Plan banner. UI/copy only;
> auto-merge if validation passes.
