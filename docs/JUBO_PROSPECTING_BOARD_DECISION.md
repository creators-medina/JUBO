# Prospecting Board — Product Decision Audit

What the Prospecting board is, what depends on it, whether it duplicates the
Daily Call Log, and what it should become. **Docs-only: nothing was changed,
hidden, renamed, moved, or migrated.**

---

## 1. Current purpose (verified in code)

The Prospecting board is an onboarding-provisioned CRM board
(`features/onboarding/templates/boards.ts`, template key `prospecting`, slug
`prospecting`): *"Top-of-funnel outreach — new leads through nurture."*
Stages: **New Leads → Attempting Contact → Connected → Follow-Up → Nurture**,
with the standard lead fields (phone/email/source/next action/notes). The
template resolver maps it to the `lead` record shape, so its contacts open as
generic/lead cards.

It is, by design, the **raw lead pipeline**: where brand-new, unworked leads
land and get triaged before they graduate to Active Leads / Pre-Approved /
the loan pipeline.

## 2. Current dependencies (why it can't just disappear)

| Dependency | Where | Impact if hidden/retired |
|---|---|---|
| **Onboarding imports** | `runOnboardingImports.ts`: `call_list` import files route to `boardKey: 'prospecting'` | New call-list imports would need a new target |
| **Onboarding personalization** | `personalization.ts`: sidebar ordering pins `prospecting` for prospecting/conversion-focused LOs | Cosmetic |
| **Workflow templates** | `templates/workflows.ts`: self-source/buys-leads/prospecting focus provisions workflows tied to it | Automations could point at a hidden board |
| **Records** | Real leads live on it in production | Hiding the board strands access to them |
| **Dashboard "new leads"** | Overview counts records created in-window on non-pipeline boards — includes Prospecting | Numbers unaffected by hiding, but the leads' *home* disappears |
| **Sidebar** | Listed dynamically under GENERATE (with Conversations) — no hardcoded nav link | Nothing breaks; it just vanishes from the list |

## 3. Does the Daily Call Log depend on it? **No.**

The theme-day queues (`themeday/queues.ts`) match boards by name for exactly:
Realtor boards (Mon), Loan In Process + Inactive Loans (Tue), Pre-Approved
(Wed), Past Clients (Thu), VIPs (Fri). `prospecting` matches none of those
specs, and none of the theme-day code references the Prospecting board or
slug. Changing/retiring Prospecting cannot affect the Daily Call Log.

## 4. Does it duplicate the Daily Call Log? **No — different jobs.**

- **Daily Call Log** = the daily *execution* layer: relationship-call rosters
  from five named boards, logging, streaks, goals.
- **Prospecting** = the *inventory* layer: where new, unworked leads live and
  move through triage stages until they graduate.

The overlap the tester felt is real but shallow: both say "prospecting."
The fix is clarity of role (and a better default view), not removal.

## 5. Recommended decision: **Option A, with C's presentation (a "lead inbox" pass)**

Keep Prospecting as the **Raw Lead Inbox**, and make it look like one:

1. **Default view: Table** — for this board, table beats Kanban (triage is a
   scanning job: source, owner, status, last contact, next action).
2. **Purpose copy** — one line on the board header/description so its role vs
   the Daily Call Log is explicit ("New leads land here; work today's calls
   from the Daily Call Log").
3. Table columns already carry the triage fields (lead fields incl. Next
   Action + lead source); no data changes needed.

Options B (retire from sidebar) and full C-rework are premature: B strands
imports/workflows/records behind a hidden surface for zero measured gain, and
a full triage-table rework should wait until Jason has used the inbox framing.
Option D (leave as-is) fails the tester feedback — the board reads as an
aimless Kanban.

## 6. Risks of hiding/retiring later (if ever)

Re-point `call_list` imports; re-home its records (a records move = gated
bulk change); re-target any provisioned workflows; onboarding template + new
orgs would still create it unless the template changes. All manageable, none
worth doing now.

## 7. Should Table become the default? **Yes — per-board, safely.**

- Today: `BoardDetailClient` defaults every board to Kanban; per-user+board
  memory (`jubo-board-view-mode:v1:<user>:<board>`) already persists whatever
  the user picks. So Jason clicking Table once already sticks — that works
  today with zero changes.
- The right durable fix needs **no schema**: `boards.display_settings`
  (JSONB, shipped in phase 5M) can carry a `default_view: 'table'` key —
  data in an existing column, written through the existing Board Settings
  modal path. Read order: **user's saved view memory → board default_view →
  'kanban'**. Per-board, org-wide, and user preference always wins.
- A name-based hack ("if board is called Prospecting default to table") is
  rejected — brittle and invisible.

## 8. Exact implementation plan (the safe next PR, on approval)

**PR: "Prospecting lead-inbox pass (per-board default view + purpose copy)"**
1. Board Settings modal: a "Default view" select (Kanban/Table) stored in
   `display_settings.default_view` (existing column, existing update path).
2. `BoardDetailClient`: initial view = saved user preference → board
   `default_view` → 'kanban'. localStorage memory behavior unchanged.
3. Jason sets Prospecting's default to Table in the UI (his action, not a
   script) — every teammate then lands on Table there by default.
4. Optional copy: board description already says "Top-of-funnel outreach";
   surface it (or a refined line) in the board header if not visible.

Auto-merge class: UI/config-only, existing write path, no schema. The only
production change is the one Jason performs himself in settings.

## 9. Needs approval before changing

- The next-PR scope above (it writes a new key into `display_settings`
  through the existing board-settings path).
- Anything from Option B (hiding/retiring) — separate, gated, not recommended.
- Any record moves/re-homing — gated bulk data change.

## 10. Suggested next prompt

> Begin Prospecting Lead-Inbox pass only: add a per-board "Default view"
> setting (Kanban/Table) stored in boards.display_settings via the existing
> Board Settings modal, make BoardDetailClient use saved-user-preference →
> board-default → kanban, and surface the board's purpose line in its header.
> No schema, no scripts, no record changes; I'll set Prospecting to Table
> myself in the UI.
