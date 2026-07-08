# Jubo Product Decisions — locked

These decisions are settled. Do not re-litigate them in future tasks; if the user changes one,
update this file in the same PR.

## Hierarchy

1. **Daily Call Log** (daily execution)
2. **Greatness Tracker** (scoreboard)
3. **Business Plan Math / Production Plan** (planning engine)

## Daily Call Log

- The Prospecting Dashboard / Theme Day cockpit is reframed as the **Daily Call Log**.
- Keep the Monday–Friday theme-day structure and the existing board sourcing:
  - **Monday — Realtor Calls** = Realtors (Top 40). *Referral Partners is intentionally
    excluded* unless specifically changed later.
  - **Tuesday — Status Calls** = Loan In Process + Inactive Loans
  - **Wednesday — Pre-Apps** = Pre-Approved
  - **Thursday — Past Clients** = Past Clients
  - **Friday — VIPs** = VIP's
- **A call counts when the LO clicks Log Call and selects/logs an outcome.** Keep the current
  outcome set (Connected / Interested / Booked / No answer / Voicemail / Follow-up).
- **Daily call goal starts at 10 outbound calls/day** (editable).
- Never fake contacts to fill a goal. If the primary bucket has fewer than 10 contacts,
  fallback filling from other sources is a FUTURE feature — do not build it until specifically
  requested.
- Weekend behavior: defaults to Monday's theme (existing convention).

## Greatness Tracker

Metrics and their definitions:

| Metric | Definition |
|---|---|
| Calls Made | Completed/logged calls (Log Call + outcome) |
| New Leads | Records **moved to Initial Consult** |
| Credit Pulls | **Not trackable yet** — future iSoft integration; show "Coming soon / Not tracked yet" |
| Pre-Approvals | Records on the **Pre-Approved board OR in a pre-approval-named stage** inside Work Loans / Loan In Process — **deduped by record_id** |
| Deals in Pipeline | Records on **Loan In Process** |
| Funded Loans | **Closing board records in funded/closed/post-closing stages** (there is no Funded board) |

- Inactive Loans = **revival opportunities**, not a success metric.
- Reporting windows: start **week-based**; grow toward Today / This Week / This Month /
  This Quarter / This Year.
- First version is **per LO/user**; company-wide/manager reporting comes later. Where record
  ownership data is unreliable, scope falls back to org-wide with a clear "All records" label.
- Real data only; no fake metrics.

## Business Plan Math / Production Plan

All assumptions are **editable by the LO**:

- Annual **net** LO comp goal (income goal means net LO comp)
- Average loan amount
- Gross comp: **default 275 bps**
- LO net split: **default 80%**
- Net comp: displays **around 225 bps** by default (derived from gross × split, and
  editable/derived)
- Conversion rates **by source** (editable)
- Lead-source mix (editable)

Onboarding should eventually collect these fields (Phase 4).

**Canonical source (Phase 3 decision):** the `production_plan_*` keys in
`onboarding_profiles.answers` are the canonical planning-assumption source (income goal,
loan amount, bps, split, mix, conversions), read by the `/production-plan` page and the pure
math module `features/production-plan/calc`. The existing `production_goals` table continues
to power the legacy `/business-plan` coaching page, the Goals page, and the Dashboard goal
card — those were intentionally left untouched in Phase 3. A later phase consolidates the
two so one income goal drives everything; until then the Production Plan page is the source
of truth for Business Plan Math.

## Lead sources

- Lead-source tags/fields **do not currently exist as stored data**.
- When built (Phase 5), lead source should use the existing `lead_source` common field /
  fields system if safe — not a new table.
- **Do not build lead-source reporting** until field provisioning + picker + backfill is
  explicitly part of an approved phase.
- Candidate source list for the future picker: Realtor Referral, Current Client Referral,
  Past Client Repeat, Past Client Referral, Builder, Business Owner, Personal Friend, VIP,
  Instagram, Facebook Ad, Website Lead, Online Lead, Open House, Event, Other.

## Credit pulls / iSoft

Credit pulls are not currently trackable. iSoft is a future external integration and requires
explicit approval, integration design, storage decisions, and a security review before any
implementation (Phase 6).
