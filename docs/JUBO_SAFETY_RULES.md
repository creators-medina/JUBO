# Jubo Safety Rules — for Claude Code sessions

These rules govern every Claude Code task on this repo. They exist because Jubo holds real
production CRM data (contacts, loans, financials) at medina-ai.com.

## Hard rules (never do these without explicit, per-instance approval)

- Do not change database schema.
- Do not create migrations.
- Do not run live data scripts.
- Do not delete records, contacts, loans, boards, groups/stages, notes, tasks, messages, or
  checklist definitions.
- Do not alter loan, money, borrower, property, appraisal, or financial values.
- Do not change auth or permissions.
- Do not build external integrations or send SMS/email, and never integrate telephony,
  without an explicitly approved phase.
- Do not hardcode fake data. Do not invent production data. No fake contacts, boards,
  metrics, or records — missing data renders as an honest empty state ("—", "Not tracked yet").

## Work autonomously (do NOT stop to ask) for

- Documentation, UI copy, and file organization
- Read-only audits and queries
- UI/layout/styling work using existing design tokens and patterns
- Read-only server aggregation over existing tables
- Writes that go through existing validated actions/RPCs (e.g. `quickCallOutcome`,
  `moveRecord`, `moveRecordToBoard`, `archiveDashboard`, `resolveFollowUp`)
- Per-browser preferences via the established localStorage hook pattern
- Storing new keys inside existing JSON columns (e.g. `onboarding_profiles.answers`) — this is
  data in an existing column, not schema
- Low-risk planning and refactoring decisions within a phase's stated scope

Make the safest production-aware choice and document it in the PR instead of asking.

## Stop and ask for approval before

- Database schema changes (new tables, columns, indexes)
- Migrations of any kind
- Live data scripts or bulk backfills
- Destructive or permanent production data changes
- Auth or permission changes
- External integrations (e.g. iSoft credit pulls) or anything that sends messages
- Anything that could corrupt, delete, or materially alter production CRM data
- Anything you are genuinely uncertain is safe

## PR / merge rule

Every change ships as a focused PR on the working branch. Open the PR, wait for the Vercel
check, and then:

- **Auto-merge is allowed** only when ALL of these hold: the change is documentation-only OR
  the user explicitly authorized a closed loop for that task; validation passed (build + lint
  with zero NEW findings vs baseline); no schema/migrations/live-data/auth/integration changes;
  and you are certain the change is safe.
- **Hold for the user's "approve"** in every other case — especially anything that changes app
  behavior or touches CRM record movement. When in doubt, hold.

If a task prompt and these rules conflict, the task prompt's *stricter* rule wins.

## Validation baseline

- `npm run build` must pass (includes TypeScript checking).
- `npx eslint` on touched files must show **zero new findings** versus the pre-existing
  baseline (verify with a `git stash` → lint → `git stash pop` comparison; this repo has known
  pre-existing findings that are not yours to fix in unrelated PRs).
- There is no test script in this repo; say so in reports rather than claiming tests ran.
- Manual verification of the deployed app is the user's step — request it explicitly for
  visual or interaction changes, and say clearly what to check.
