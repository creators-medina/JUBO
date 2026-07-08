@AGENTS.md

# Jubo project guide for Claude Code

Before making changes, read:

1. `docs/JUBO_MASTER_PLAN.md` — the Daily Call Log · Greatness Tracker · Business Plan Math
   system and repo working conventions
2. `docs/JUBO_SAFETY_RULES.md` — what you may do autonomously vs what stops for approval
3. `docs/JUBO_PRODUCT_DECISIONS.md` — locked product decisions (do not re-litigate)
4. `docs/JUBO_PHASE_PLAN.md` — the phase/PR sequence; implement only the requested phase
5. `docs/JUBO_DISCOVERY_REPORT.md` — verified technical findings (data model, storage, boards)

Operating style: work autonomously on safe implementation decisions. Stop for approval only
before schema changes, migrations, live data scripts, destructive data changes,
auth/permission changes, or external integrations. This is a production CRM with real loan and
contact data — never fake data, and validate every change (build + zero new lint findings)
before opening a PR.
