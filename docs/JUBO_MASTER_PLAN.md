# Jubo Master Plan — Daily Call Log · Greatness Tracker · Business Plan Math

> **Read this first.** This is the master plan for turning Jubo / Medina AI Prospecting into a
> three-part loan-officer business-growth system. Companion documents:
>
> - `docs/JUBO_SAFETY_RULES.md` — what Claude may do autonomously and what requires approval
> - `docs/JUBO_PRODUCT_DECISIONS.md` — locked product decisions (do not re-litigate)
> - `docs/JUBO_PHASE_PLAN.md` — the PR-by-PR build sequence with per-phase gates
> - `docs/JUBO_DISCOVERY_REPORT.md` — verified technical findings this plan is built on

## The system

Jubo's prospecting surface becomes three connected parts, in this hierarchy:

1. **Daily Call Log** — the daily execution tool: who to call today (theme-day call list) and
   whether the LO did it (Log Call + outcome). This is the reframed Prospecting Dashboard /
   Theme Day cockpit.
2. **Greatness Tracker** — the scoreboard: Calls Made, New Leads, Credit Pulls, Pre-Approvals,
   Deals in Pipeline, Funded Loans. Read-only, real data only, starting with week-based windows
   and growing toward Today / Week / Month / Quarter / Year.
3. **Business Plan Math / Production Plan** — the planning engine: annual net comp goal,
   average loan amount, comp assumptions, lead-source mix, and conversion assumptions → the
   required funded units, pipeline, leads, and daily activity.

The three feed each other: the Business Plan sets the activity targets, the Daily Call Log is
where the activity happens, and the Greatness Tracker shows whether reality is tracking the plan.

## Scope principles

- **First version is per LO/user.** Company-wide / manager reporting comes later.
- **Real data only.** Never fake contacts, metrics, boards, or records. Missing data renders as
  an honest empty/"not tracked yet" state.
- **Reuse existing models.** Calls are `communication_logs`; stage history is `record_movements`;
  assumptions live in `onboarding_profiles.answers`; goals reconcile with `production_goals`.
  See the discovery report for the verified details.
- **Phases ship independently.** Each phase in `docs/JUBO_PHASE_PLAN.md` is a standalone PR with
  its own gates. Implement only the requested phase.

## How future Claude Code tasks should start

Begin future tasks with:

> Read `CLAUDE.md` and `docs/JUBO_MASTER_PLAN.md` before making changes. Follow
> `docs/JUBO_SAFETY_RULES.md`. Implement only the requested phase from
> `docs/JUBO_PHASE_PLAN.md`. Work autonomously on safe implementation choices. Only stop for
> schema, migration, live data, auth/permission, destructive data, or external integration risks.

That one paragraph replaces pasting the full context: the product decisions, discovery findings,
phase boundaries, and safety rules all live in this `docs/` set. If a future instruction
contradicts these docs, ask the user which wins and update the docs to match the answer.

## Working conventions already established in this repo

- Validation baseline: `npm run build` (includes typecheck) + `npx eslint` on touched files,
  compared against the pre-existing lint baseline via `git stash` diff (the repo has known
  pre-existing findings; the bar is **zero new findings**, not zero total).
- Money always flows through the shared resolver `features/fields/loanAmount.ts`.
- Record moves only through `moveRecord` (same-board stage change) and `moveRecordToBoard`
  (cross-board) — never raw table updates or raw RPCs.
- Per-browser UI preferences use the established localStorage + `useSyncExternalStore` hook
  pattern (`hooks/useSidebar*`); cross-device state belongs in backend storage.
- Jubo design tokens (`--jubo-navy`, `--jubo-red`, `--jubo-gold`, `--jubo-green`, cream
  background, `Archivo` + `IBM Plex Sans` on designed pages) — match the existing pages.
