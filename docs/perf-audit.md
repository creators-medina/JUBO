# PERF-AUDIT — diagnosis of the universal ~2–4s slowness (DIAGNOSE ONLY)

Symptom: nearly every operation costs ~2–4s regardless of how much DB work it does
(board switch ~2s, card open ~4s, tab switch ~3s every time, move/add lead ~2–3s).
Only drag-and-drop feels fast.

## Core finding
The cost tracks the **number of serial server round-trips per operation**, not data
volume. Card open (~8 serial hops) ≈ 4s > tab switch (2 serial POSTs) ≈ 3s > board
switch (~5–6 hops) ≈ 2s. That is the signature of a **high fixed per-round-trip
latency × serial hop count**, i.e. each Supabase/Auth hop is expensive and we make
many of them in series. Drag-and-drop is fast because it updates the UI optimistically
and never waits on the server.

## Findings table

| Suspect | Verdict | Evidence |
|---|---|---|
| Per-round-trip latency × serial hops (DOMINANT) | **CONFIRMED (mechanism); per-hop latency LIKELY region-driven** | Hop counts below scale with observed times. |
| Auth overhead per request | **CONFIRMED** | `proxy.ts:29` calls `auth.getUser()` (network call to Supabase Auth) on every matched request (matcher = everything except static assets). Server actions ALSO call `getUser()` themselves (records/actions.ts ×9, person-card/actions.ts ×3, communicate.ts ×1). So a card open = middleware `getUser` + `getFileCardData`'s `getUser` = 2 auth hops before/around the data. |
| Supabase↔Vercel region mismatch | **LIKELY — must verify (I can't see regions from here)** | No `regions`/`preferredRegion` set anywhere (vercel.json has only crons; next.config empty), so functions run in Vercel's default region. If that's far from the Supabase project's region, every hop pays cross-region RTT — and there are many hops. Project ref `sbkfnsfmwrfussufimzs` doesn't encode region; check dashboards. |
| Per-tab full round-trips | **CONFIRMED** | Each tab fetches on click. `LoanPropertyTab` runs `ensureLoanPropertyFields` **then** `load()` — **two serial server-action POSTs** every open (LoanPropertyTab.tsx:66–67). `BorrowerTab` calls `ensurePrimaryBorrower` (BorrowerTab.tsx:43). `FinancialTab` calls `getFinancials`+`getBorrowers`. None preloaded at card open. |
| Serial hops in `getFileCardData` | **CONFIRMED (~7–8 serial)** | `getUser` → `records` → `field_values` → `fields` → `boards` → `Promise.all([...])` → `profiles` → `messages` — each an awaited round-trip. (C4-FIX `safe()` wrappers present — 17 of them — and MUST be preserved by any optimization.) |
| Non-optimistic actions | **CONFIRMED** | Only drag is optimistic: `BoardDetailClient.tsx:239` sets `localRecords` first, then awaits `moveRecord`. Everything else (card Move-To-Stage, Add Record, field edits, tab loads) awaits the server before showing anything. `moveRecord` also does `revalidatePath` + a workflow dispatch (records/actions.ts) → extra serial hops + a full board re-render. |
| Serverless cold starts | **POSSIBLE — must test** | Vercel nodejs functions, no warming. Cold start would explain a slow *first* hit but NOT "3s EVERY tab switch," so it's a contributor at most, not the uniform cause. The two-clicks test below settles it. |
| Data volume / query structure | **RULED OUT** | Operations doing tiny work (tab switch, move one lead) cost the same as big ones. Time isn't payload-bound. |

## Most likely DOMINANT cause
**High per-round-trip latency (most plausibly a Vercel↔Supabase region gap, compounded
by an Auth `getUser()` network call on every request) multiplied by many serial hops
per operation.** Reduce either factor — fewer hops, or lower per-hop latency — and
everything gets proportionally faster.

## Tests for YOU to run (I have no browser)

1. **Cold start vs steady** — Open a card; note seconds to fields populate. Close it,
   immediately reopen the SAME record; note again. Then a 3rd time.
   - 1st slow, 2nd/3rd fast → cold start is a big factor.
   - all three ~same → steady per-hop overhead (region/auth). *(I expect all three slow.)*

2. **Network duration vs payload (DevTools → Network)** — Open a card, switch to the
   Loan tab. Find the server-action POST(s) (type `fetch`, to the same page URL). Report:
   (a) how many POSTs fire for that one tab switch, (b) each POST's **Time/Duration**,
   (c) each **response size**. Tiny response + long duration = latency-bound (confirms
   the diagnosis); also confirms LoanProperty fires 2 POSTs.

3. **Region check** —
   - Vercel: Project → Settings → Functions (or Project → Settings → General) → note the
     **Region** (e.g. `iad1` = US-East/D.C.).
   - Supabase: Project → Settings → General → **Region**.
   - If they're not the same/adjacent region, that's the latency multiplier. (Quick
     indicative RTT from your machine: `curl -o /dev/null -s -w "%{time_total}\n"
     https://sbkfnsfmwrfussufimzs.supabase.co/auth/v1/health` a few times — note it's
     your latency, not Vercel's, but a large number is a red flag.)

4. **Optimistic confirmation** — Move a lead by **dragging** (fast) vs moving it via the
   card's **Move to stage** dropdown (slow). If drag is instant and the dropdown waits
   ~2–3s, that confirms optimistic-vs-blocking is the perceived-speed difference.

## Prioritized fix plan (DO NOT BUILD HERE — for review)

### A. No security surface — safe to do anytime (ranked by impact ÷ effort)
1. **Region colocation** (if test 3 shows a gap). *Targets: all symptoms.* Pin Vercel
   functions to the Supabase region (or vice-versa). **Highest impact, lowest effort** —
   one setting; lowers EVERY hop's latency. Risk: ~none.
2. **Preload all 4 tabs at card open + switch client-side.** *Targets: 3s/tab-switch.*
   Load Loan/Borrower/Financial data once with the card; tab clicks become pure client
   render (0 round-trips). Risk: low.
3. **Optimistic updates for move/add lead + field edits** (mirror the drag pattern).
   *Targets: move/add ~2–3s.* Show the change immediately, write in background, roll back
   on error. Risk: low–medium (needs rollback paths).
4. **Provisioning off the click path.** *Targets: Loan tab.* `ensureLoanPropertyFields`
   runs before render as a 2nd serial POST; skip it when fields already exist client-side
   (or run it once, in parallel, not blocking). Risk: low.
5. **Parallelize `getFileCardData`** — collapse ~8 serial hops to ~3 (merge `field_values`
   into the big `Promise.all`; run `profiles`/`messages`/`fields` concurrently where deps
   allow). **MUST preserve every `safe()` wrapper** (a missing thread/twilio/profile must
   not null the card — that was the C4-FIX regression). *Targets: card open ~4s.* Risk:
   medium (ordering correctness).
6. **Drop/throttle the focus-refetch** (PersonFileCard refetches the whole bundle on every
   window focus). *Targets: stray reloads.* Risk: low.
7. **Cold-start mitigation** if test 1 implicates it: keep functions warm / reduce bundle.
   Risk: low.
8. **(Bigger) one-RPC card load** — a `SECURITY DEFINER` function returning the whole
   bundle in ONE round-trip. *Targets: card open.* Largest server-side win; more effort;
   must replicate RLS scoping inside the function. Risk: medium.

### B. Has a security surface — GATED on verifying RLS live first
9. **Middleware `getUser()` → `getSession()`/`getClaims`** (skip the per-request Auth
   network hop; gate on the locally-readable session). *Targets: a flat ~100–300ms on
   EVERY request.* **DO NOT DO until RLS is verified live.** `record_borrowers` and
   `record_financial_items` hold SSNs/account numbers protected only by RLS policies that
   have **never been tested live**; weakening the middleware check before confirming RLS
   actually blocks cross-org reads would risk exposing PII. Verify RLS first (a second
   org/user cannot read another org's borrowers/financials), THEN consider this. Risk:
   HIGH until RLS is proven.

## Constraints honored
Diagnosis only — no app code changed. The only file added is this `docs/perf-audit.md`.
What I could not measure (regions, real request timings, cold-start behavior) is handed
to you as copy-paste tests above.
