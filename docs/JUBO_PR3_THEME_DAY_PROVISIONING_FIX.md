# Jubo PR 3 — Theme-Day Provisioning Fix

Makes newly provisioned organizations get boards that satisfy all five Daily
Call Log theme days, closing the market-readiness finding that Tuesday,
Wednesday, and Friday showed "source board not found" for new orgs. **Future
onboarding templates only — no existing org, board, record, or matcher logic is
changed.**

---

## 1. Current mismatch

The Daily Call Log sources each weekday from boards matched by name
(`features/prospecting/themeday/queues.ts`), but the onboarding board templates
(`features/onboarding/templates/boards.ts`) used names that only matched 2 of 5
days:

| Day | Matcher needs (keyword) | Old template board | Result |
|---|---|---|---|
| Mon | `realtor` | Realtors / Partners | ✅ matched |
| Tue | `inprocess` + `inactive` | Loan Pipeline | ❌ neither |
| Wed | `preapp` | *(only an Active-Leads group)* | ❌ none |
| Thu | `pastclient` | Past Clients | ✅ matched |
| Fri | `vip` | *(none)* | ❌ none |

So every template-provisioned org opened `/prospecting` with empty Tue/Wed/Fri
queues and "not found" chips — the flagship experience broken 3 days a week.

## 2. Root cause

The theme-day matchers were built around Medina's hand-named boards
("Loan In Process", "Inactive Loans", "Pre-Approved", "VIP's"), but the
onboarding starter templates were authored separately with generic names
("Loan Pipeline", "Active Leads") and never included Inactive Loans,
Pre-Approved, or VIPs boards. The two were never reconciled.

## 3. Chosen fix — Option A (fix future onboarding templates)

Give newly provisioned orgs boards whose names satisfy the matchers. This was
chosen over Option B (broaden the matchers) because:

- **Friday cannot be fixed by matchers alone** — no VIP board exists in the
  template to match, so a board must be added regardless.
- Option B would change matching for **existing** orgs (risk), which the safety
  rules forbid without approval.
- The board names are not an open product question — they come straight from the
  **locked** theme-day source mapping in `docs/JUBO_PRODUCT_DECISIONS.md`.

**What changed in the templates:**

- Renamed `Loan Pipeline` → **`Loan In Process`** (template key `pipeline`
  unchanged, so dashboards/imports/goals that reference it by key are
  unaffected; `board_type` stays `pipeline`). → Tuesday active source.
- Added **`Inactive Loans`** board (key `inactive_loans`). → Tuesday inactive source.
- Added **`Pre-Approved`** board (key `pre_approved`). → Wednesday source.
- Added **`VIPs`** board (key `vips`). → Friday source.
- `Realtors / Partners` (Mon) and `Past Clients` (Thu) already matched — unchanged.
- Added the new keys to the personalization board order for a sensible sidebar
  order (omitted keys are still provisioned — `orderBoards` appends them).

Also, behavior-neutral: the theme-day matcher (`DAY_BOARD_SPECS`, name-squash,
and a new pure `resolveThemeDaySources` helper) was extracted into
`features/prospecting/themeday/matchers.ts` so it is unit-testable and shared;
`queues.ts` imports it. A verification test asserts the locked canonical mapping
is byte-identical, so Daily Call Log behavior for existing orgs (incl.
Medina/BOMAC) is provably unchanged.

## 4. Boards required for each theme day (verified)

Resolution of the new template board set (`resolveThemeDaySources`, run against
`BOARD_TEMPLATES`):

```
Template boards: Prospecting | Active Leads | Loan In Process | Inactive Loans |
                 Pre-Approved | Past Clients | Realtors / Partners | VIPs
Mon: matched=[Realtors / Partners]              missing=[]
Tue: matched=[Loan In Process, Inactive Loans]  missing=[]
Wed: matched=[Pre-Approved]                     missing=[]
Thu: matched=[Past Clients]                     missing=[]
Fri: matched=[VIPs]                             missing=[]
```

All five days resolve; zero missing.

## 5. Future orgs vs existing orgs

- **Future orgs: fixed.** `provisionWorkspace` runs once at onboarding; every new
  org created after this deploys gets all five theme-day source boards.
- **Existing orgs: unaffected by this PR** (provisioning does not re-run for
  them). Nothing is renamed, moved, or backfilled.

## 6. Do existing orgs need a backfill?

- **Medina / BOMAC: no.** It already has its real boards (Loan In Process,
  Inactive Loans, Pre-Approved, VIP's, Past Clients, Realtors (Top 40)) and its
  Daily Call Log already resolves all five days. Verified: the matcher canonical
  mapping is unchanged by this PR.
- **Any org already onboarded from the OLD template** (if any beta/test orgs
  exist) still has the mismatch. Fixing them means **creating the missing boards
  for that org** (Inactive Loans, Pre-Approved, VIPs) and optionally renaming
  its `Loan Pipeline` → `Loan In Process`. That touches existing org data, so it
  is **gated / a separate reviewed action** — not done here. Recommended
  approach when needed: create the boards through the normal in-app "New board"
  flow (non-destructive, no records moved), or a reviewed per-org script. No
  destructive migration is involved.

## 7. Validation / test results

- **Matcher test** (`features/prospecting/themeday/matchers.test.ts`, `node:test`,
  run via esbuild bundle): **4/4 pass** — all five days resolve with zero
  missing; Tuesday resolves both boards; each expected board maps to its
  weekday; the locked canonical mapping is unchanged.
- **Lint:** 0 findings on all touched files.
- **Build:** `npm run build` compiles successfully (typecheck clean).

## 8. Remaining risks

- **Minor:** the renamed `Loan In Process` board keeps its `Funded` group, so
  Tuesday's status-call roster will include funded files for a brand-new org
  until the LO adjusts — acceptable for a starter (empty at first anyway), not a
  correctness issue.
- **Existing template-provisioned orgs** (if any exist beyond Medina) keep the
  mismatch until the gated per-org backfill (§6) is run.
- New orgs now provision **8 starter boards** instead of 5. Board names are
  dictated by the locked source mapping; if the starter set should be trimmed or
  renamed, that's a separate product tweak (keys are stable, so it's low-risk).

## 9. External beta readiness status after PR 3

**Resolved for future orgs.** New external orgs now get a Daily Call Log that
populates all five weekdays out of the box — the flagship experience is no
longer broken for new customers. Existing template-provisioned orgs (if any)
need the separate gated backfill in §6; Medina/BOMAC needs nothing.
