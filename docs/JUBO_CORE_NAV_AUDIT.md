# Jubo Core Navigation Audit — Action Center · Dashboard · Conversations

Root-cause audit of the three pages reported as "does not work right"
(tester triage §3). Code audit + runtime verification (as far as this
environment allows — see §7). **No behavior was changed: this is a
docs-only diagnostic.** Nothing here found a crash, a broken query, or a
data-wiring bug; all three pages are structurally sound, and each report
traces to slowness, honesty-vs-memory, or data starvation instead.

---

## 1. Executive summary

| Page | Verdict | Likeliest user-facing symptom |
|---|---|---|
| Action Center (`/today`) | **Working as designed, but slow and duplicative** | Multi-second first load (heavy work runs before first byte); overlaps Daily Call Log/Dashboard |
| Dashboard (`/dashboard`) | **Working as designed, pending repro** | Numbers honestly changed definition (Step 2); fit-to-screen layout hides list content on small laptops |
| Conversations (`/conversations`) | **Built and working; data-starved** | Empty inbox until Twilio SMS traffic exists — threads only come from real sent/received texts |

None qualifies for a "tiny fix" without guessing; each has a named
follow-up PR (§11) and two need Jason's 10-minute repro session first.

## 2. Action Center (`/today`)

- **Route:** `/today` · sidebar label **Action Center** (IA step 1) · linked ✓
- **Components:** `app/(app)/today/page.tsx` (server) → `features/daily-actions/components/TodayPageClient.tsx` (client, 537 lines). `loading.tsx` exists ✓
- **Data/queries:** daily actions (`getTodayActions`), production goals + per-goal funnel stages/assumptions/targets, stale records, attention views, streaks, follow-up count, prospecting metrics, coach insights, onboarding checklist.
- **Auth:** user + membership guards, redirect to `/login` / `/onboarding` ✓; plan-reveal gate redirects first-time completed-onboarding users to `/onboarding/reveal`.
- **Why it feels broken — two structural causes, no bug:**
  1. **Heavy work runs before first byte, sequentially:** integration worker
     drain + scheduled jobs → workflow scans (30-min throttle) → daily-action
     generation → progress snapshot — all awaited in the server component
     before any data fetch begins. Then goal pacing runs **N+1 queries per
     goal** (stages + assumptions + targets + a count per goal, in a loop).
     On a normal connection this is seconds of skeleton.
  2. **Duplicative purpose** (operator audit §2.2): three "what do I do
     today" front doors. The tester's "doesn't work right" may equally mean
     "I don't know what this page is for vs the Daily Call Log."
- **Label/meaning match:** partially — "Action Center" implies actions; the page also carries goals pacing, attention views, streaks, coach insights.

## 3. Dashboard (`/dashboard`)

- **Route:** `/dashboard` · sidebar label **Dashboard** · linked ✓ · `loading.tsx` ✓
- **Components:** `app/(app)/dashboard/page.tsx` (server) → `features/dashboards/overview/DashboardOverview.tsx` (client, 400 lines) over `buildDashboardOverview` (`features/dashboards/overview/queries.ts`).
- **Metric definitions:** ✅ uses the shared definitions from the audit roadmap — movement-dated funded (`features/metrics/funded`), shared pipeline rule (`isOpenPipelineRecord`), shared loan-amount resolver. **Nothing in this audit changed any metric definition.**
- **Candidate causes checked:** no broken query, no missing org filter (all org-scoped), no hydration hazard found; error handling returns honest zeros; period toggle client-side.
- **Why it may feel broken:**
  1. **Numbers ≠ memory:** Step 2 deliberately moved funded to movement-dated Closing-board entries (labeled in-app). If the tester compared against the old proxy numbers, "wrong data" is actually the fix working.
  2. **Fit-to-screen design:** desktop is a no-page-scroll layout with internally-scrolling lists — on a small laptop the three columns compress and lists show 2–3 rows, which can read as "missing data."
  3. Count-up animations may read as flicker on slow data.
- **Needs from Jason:** which number/card looked wrong, screen size, and any console errors — before touching anything (metric changes are gated regardless).

## 4. Conversations (`/conversations`)

- **Route:** `/conversations` · linked in the sidebar's GENERATE section ("Conversations") ✓ · `loading.tsx` ✓
- **Components:** `app/(app)/conversations/page.tsx` (server: auth + `getConversationThreads`) → `ConversationsPageClient` (client): thread list with unread badges + relative times, selected-thread pane with `ConversationTimeline`, `tel:`/copy actions, open-in-workspace, mobile back navigation, and the real `SMSComposeBox` composer. Mark-read on open. **This is already a working two-pane inbox, not a stub.**
- **Data:** `conversation_threads` (+ record join) and `communication_logs` by `thread_id`. Threads are created/updated by the real SMS layer (`logSMS.ts`) on every outbound send and inbound webhook — verified in code.
- **Why it feels broken:** **no data.** Without an active Twilio connection there are zero threads, and the page renders its (accurate) empty state pointing at Settings → Communications. Every "doesn't work" path traces to thread starvation, not code.
- **Honest gaps vs a GHL-style inbox (the ask):**
  - SMS-only — calls/notes/emails from `communication_logs` don't appear in the thread timeline
  - No search/filter/assignee, no archived view in the UI (archive action exists)
  - No realtime updates — new inbound messages appear on reload/click, not live
  - No contact context panel beside the thread (workspace button instead)
  - One behavior worth revisiting: the FIRST thread auto-opens on page load and is **marked read without a click** (a write via `markThreadRead`) — left untouched here because changing it alters a communication write path.

## 5. Route/component map (summary)

| Page | Server | Client | Loading | Empty state | Errors |
|---|---|---|---|---|---|
| `/today` | `today/page.tsx` (heavy pre-work) | `TodayPageClient` | ✓ | per-section | best-effort try/catch (silent) |
| `/dashboard` | `dashboard/page.tsx` | `DashboardOverview` | ✓ | honest zeros/— | query-level nulls → zeros |
| `/conversations` | `conversations/page.tsx` | `ConversationsPageClient` | ✓ | ✓ (Twilio pointer) | action errors → toast |

## 6. Data sources

- `/today`: daily_actions, production_goals + funnels/stages/assumptions/targets, records (stale + counts), attention views, snapshots/streaks, communication follow-ups, prospecting metrics, coaching, onboarding.
- `/dashboard`: records + record_movements (shared funded), board_groups, communication follow-ups/activity, goals.
- `/conversations`: conversation_threads, communication_logs, integration_connections (Twilio), opt-outs.

## 7. Runtime verification (environment-limited)

Production build compiles (exit 0). `next start` in this sandbox (no
production Supabase credentials, so no authenticated session possible):

- `/today`, `/dashboard`, `/conversations`, `/prospecting` → clean `307 → /login` (auth guards working, no 500s)
- `/login` → `200`
- Server log: zero errors

Authenticated runtime behavior (real data, console, network) **cannot be
verified from this environment** — that's exactly what the 10-minute repro
session with Jason is for (open each page, say what looks wrong, screenshot
the console). No claims are made beyond code + unauthenticated probes.

## 8. Console/server/build errors found

None (build clean; unauthenticated probes clean; no static analysis errors).

## 9. Tiny fixes implemented

**None.** Nothing found qualifies as an obvious, blind-safe tiny fix:
- `/today`'s slowness fix means moving/deferring load-bearing triggers (gated, per the IA plan) or restructuring to stream — not tiny.
- Dashboard has no confirmed defect to fix.
- Conversations' auto-mark-read touches a write path (excluded by this task's rules).

## 10. Larger fixes deferred

1. `/today` performance: defer best-effort work (worker/scans/generation/snapshot) out of the render path — after-response or a real scheduler (**gated**: moves load-bearing triggers); batch the per-goal N+1 pacing queries.
2. Dashboard: awaiting repro; likely copy/labeling or responsive-layout tuning, not metric changes (metric definitions stay as-is regardless — gated).
3. Conversations phases (see PR C/D below).
4. Auto-mark-read on first thread → require an explicit click (small, but a write-path behavior change — needs a normal reviewed PR, not a blind fix).

## 11. Recommended order + next PRs

- **PR A — Action Center speed + purpose (after repro):** move the four best-effort pre-render steps out of the blocking path where safe (anything trigger-moving is gated and needs approval), batch goal pacing queries, and add a one-line purpose header distinguishing it from the Daily Call Log.
- **PR B — Dashboard correctness (after repro):** fix the specific thing Jason saw; likely responsive layout for the fit-to-screen grid + honesty footnotes; **no metric definition changes**.
- **PR C — Conversations foundation:** ✅ shipped — layout polish (avatars, selected accent, unread emphasis), client-side search over loaded threads, contact-context header actions (Open contact + Board from already-loaded data), labeled SMS composer bar, and the honest explain-where-threads-come-from empty state with Daily Call Log / Twilio CTAs. **No write behavior touched.**
- **PR D — GHL-style upgrade (phased; each phase its own PR):**
  - *Phase 1 — foundation polish + empty state:* ✅ shipped in PR C.
  - *Phase 2 — search/filters/contact context:* search shipped in PR C (client-side); remaining: unread-only/archived filters and a richer context panel (reuse contact-card pieces) — safe UI over existing data.
  - *Phase 3 — manual read/unread controls:* replace the page-load auto-mark-read (documented below) with click-to-mark-read + a mark-unread action — **touches the mark-read write trigger; needs its own reviewed PR**.
  - *Phase 4 — realtime updates:* live inbound message refresh (polling first, Supabase realtime later) — **gated (realtime subscriptions)**.
  - *Phase 5 — multi-channel timeline:* render calls/notes/emails from `communication_logs` alongside SMS in the thread pane (read-only additions), multi-channel composer only where real send paths exist — after Twilio is live and Phase 3/4 are settled.
  - **Standing caution (verified again in PR C):** the first thread auto-opens on page load and, if it had unread, is marked read without a click (`markThreadRead` fires from the mount effect). Left byte-identical in PR C; fixing it is Phase 3's reviewed PR.

**Suggested next prompt:** run the 10-minute repro with Jason on all three
pages (exact symptom + console screenshot each), then "Begin PR A only:
Action Center speed pass" with the repro findings pasted in.
