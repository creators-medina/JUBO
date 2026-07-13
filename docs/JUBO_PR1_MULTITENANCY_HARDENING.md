# Jubo PR 1 — Multi-Tenancy Critical Hardening

Fixes the two critical multi-tenancy blockers from
`docs/JUBO_MARKET_READINESS_AUDIT.md` (§9 T1 + T2) before any external beta.
One migration, no app-code changes, no user-facing behavior change.

**Status: migration written and rehearsed locally. NOT applied to production.
Production SQL is gated — apply via the runbook in §4 after review.**

---

## 1. What was found

### T1 — `move_record()` was an anon-callable cross-tenant write primitive

The same-board stage-move RPC `public.move_record(uuid, uuid, uuid,
movement_type)` (defined `20260514200128_move_record_rpc.sql`, last redefined
`20260619000000_phase34b2b_reset_default_status.sql:30`) was:

- `SECURITY DEFINER` (runs as the owner, bypassing RLS), **and**
- had **no `auth.uid()` / `is_org_member` check**, **and**
- had **no `REVOKE … FROM PUBLIC`** anywhere in any migration.

Postgres grants `EXECUTE` to `PUBLIC` by default on a new function, so under
Supabase's default roles the function was callable by **`anon` and
`authenticated`** for **any record in any org**. It never validated the target
group either. Impact: anyone who obtained/guessed a record UUID could move any
org's record to any group, write `record_movements` / `activities` rows with an
arbitrary `moved_by`, and (via the phase-34B2B `reset_default_status` call)
delete a record's default-status `field_values` row — all cross-tenant.

Its sibling `move_record_to_board()` (phase 32A,
`20260611000000_phase32a_cross_board_move.sql:101-102`) already does this
correctly: `is_org_member` check + destination board/group org validation +
`REVOKE ALL … FROM PUBLIC; GRANT … TO authenticated`. `move_record` was simply
never hardened to match.

### T2 — Realtime DELETE leak on `field_values`

`field_values` is in the `supabase_realtime` publication with `REPLICA
IDENTITY FULL` (`20260514214447_enable_realtime.sql:3,11`). Supabase Realtime
**does not apply RLS to DELETE events**, and `REPLICA IDENTITY FULL` puts the
**entire deleted row** in the DELETE payload. `field_values` rows are deleted
in normal operation on every stage move (`reset_default_status`) and on
cross-board moves and record deletes (cascade). So any authenticated user
could hand-roll a `postgres_changes` subscription to `field_values` and receive
**other orgs'** deleted values — `value_text` / `value_number` holding names,
phones, and loan amounts.

**Key mitigating fact for the fix:** the app's only `field_values` realtime
consumer is `hooks/useBoardRealtime.ts`, which **ignores the event payload
entirely** — every event just calls `router.refresh()` (debounced). The app
does not read any deleted-row column, so it does not need `REPLICA IDENTITY
FULL` on `field_values`.

## 2. What was fixed

A single narrow migration (§3):

1. **Hardened `move_record`** to the `move_record_to_board` pattern:
   - Resolves the record's org + board from the record row (never trusts
     caller input).
   - `RAISE EXCEPTION 'record_not_found'` if the record is gone.
   - `IF NOT public.is_org_member(v_org_id) THEN RAISE 'forbidden'` — active-org
     membership required (blocks cross-org and anon).
   - Validates the target group exists, is live, and belongs to the **same
     board** as the record (`group_not_found` / `group_board_mismatch`) — blocks
     cross-org/cross-board targets and a latent group/board desync bug.
   - The `UPDATE` / `record_movements` / `activities` / `reset_default_status`
     body is **byte-for-byte the prior behavior** for legitimate moves.
   - `REVOKE ALL … FROM PUBLIC; GRANT EXECUTE … TO authenticated`.

2. **`field_values` → `REPLICA IDENTITY DEFAULT`** so DELETE events broadcast
   only the primary key (`id`). It stays in the publication, so live
   INSERT/UPDATE refreshes (which **are** RLS-filtered per subscriber) keep
   working, and the payload-ignoring hook is unaffected.

**Decision: Option A (harden), not B (deprecate) or C (replace call sites).**
All three call sites — `features/records/actions.ts:227` (Kanban drag / stage
dropdown), `features/mortgage/actions.ts:50` (milestone advance),
`features/workflows/engine/dispatch.ts:209` (same-board workflow move) — still
need a same-board move, and `move_record`'s `stage_change` semantics (no
subitem cascade, no board change) differ from `move_record_to_board`'s
`board_change` semantics. Hardening in place is the smallest change that
preserves exact behavior. **No app code changed.**

## 3. Migration added

`supabase/migrations/20260713000000_pr1_multitenancy_hardening.sql`

Idempotent (`CREATE OR REPLACE` / `REVOKE` / `GRANT` / `ALTER … REPLICA
IDENTITY` are all safe to re-run). Touches no records, no data, no unrelated
policies or RPCs. The exact SQL is reproduced in §4B.

## 4. Production runbook (Supabase SQL Editor — GATED, apply after review)

Run these as the project owner in the Supabase SQL Editor for project
`sbkfnsfmwrfussufimzs`. **Lock/risk level: very low.** `CREATE OR REPLACE
FUNCTION` takes a brief lock on the function only; `ALTER TABLE … REPLICA
IDENTITY` is a catalog-only change (no table rewrite, no row locks, effectively
instant). No data is read or written.

### A. Pre-flight verification (run first, record the output)

```sql
-- A1. move_record exists and its current grants (look for =X in proacl, and/or
--     an empty/PUBLIC acl meaning PUBLIC has EXECUTE).
SELECT p.proname,
       pg_get_function_identity_arguments(p.oid) AS args,
       p.prosecdef AS security_definer,
       p.proacl    AS acl
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('move_record','move_record_to_board')
ORDER BY p.proname;

-- A2. Can anon / authenticated / PUBLIC execute move_record right now?
--     Expected BEFORE the fix: all three true.
SELECT has_function_privilege('anon',
         'public.move_record(uuid,uuid,uuid,public.movement_type)','EXECUTE')          AS anon_can,
       has_function_privilege('authenticated',
         'public.move_record(uuid,uuid,uuid,public.movement_type)','EXECUTE')          AS auth_can,
       has_function_privilege('public',
         'public.move_record(uuid,uuid,uuid,public.movement_type)','EXECUTE')          AS public_can;

-- A3. field_values publication membership. Expected: one row.
SELECT pubname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='field_values';

-- A4. field_values replica identity. Expected BEFORE the fix: 'f' (FULL).
SELECT relname, relreplident FROM pg_class WHERE relname='field_values';
```

### B. Migration SQL (paste and run as one statement batch)

This is the exact contents of
`supabase/migrations/20260713000000_pr1_multitenancy_hardening.sql`:

```sql
CREATE OR REPLACE FUNCTION public.move_record(
  p_record_id      UUID,
  p_to_group_id    UUID,
  p_moved_by       UUID,
  p_movement_type  public.movement_type DEFAULT 'stage_change'
)
RETURNS VOID AS $$
DECLARE
  v_from_group_id  UUID;
  v_org_id         UUID;
  v_board_id       UUID;
  v_grp_board      UUID;
BEGIN
  SELECT group_id, organization_id, board_id
    INTO v_from_group_id, v_org_id, v_board_id
    FROM public.records
    WHERE id = p_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT board_id INTO v_grp_board
    FROM public.board_groups
    WHERE id = p_to_group_id AND is_archived = false;
  IF v_grp_board IS NULL THEN
    RAISE EXCEPTION 'group_not_found' USING ERRCODE = 'no_data_found';
  END IF;
  IF v_grp_board <> v_board_id THEN
    RAISE EXCEPTION 'group_board_mismatch' USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.records
    SET group_id = p_to_group_id, updated_at = NOW()
    WHERE id = p_record_id;

  INSERT INTO public.record_movements (organization_id, record_id, from_group_id, to_group_id, moved_by, movement_type)
  VALUES (v_org_id, p_record_id, v_from_group_id, p_to_group_id, p_moved_by, p_movement_type);

  INSERT INTO public.activities (organization_id, record_id, user_id, activity_type, metadata)
  VALUES (
    v_org_id, p_record_id, p_moved_by, 'status_change',
    jsonb_build_object('from_group_id', v_from_group_id, 'to_group_id', p_to_group_id, 'movement_type', p_movement_type::text)
  );

  PERFORM public.reset_default_status(p_record_id, v_board_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.move_record(UUID, UUID, UUID, public.movement_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_record(UUID, UUID, UUID, public.movement_type) TO authenticated;

ALTER TABLE public.field_values REPLICA IDENTITY DEFAULT;
```

### C. Post-migration verification (run after; confirm the expected results)

```sql
-- C1. anon/PUBLIC can no longer execute; authenticated still can.
--     Expected: anon_can=false, public_can=false, auth_can=true.
SELECT has_function_privilege('anon',
         'public.move_record(uuid,uuid,uuid,public.movement_type)','EXECUTE')  AS anon_can,
       has_function_privilege('authenticated',
         'public.move_record(uuid,uuid,uuid,public.movement_type)','EXECUTE')  AS auth_can,
       has_function_privilege('public',
         'public.move_record(uuid,uuid,uuid,public.movement_type)','EXECUTE')  AS public_can;

-- C2. field_values replica identity is now DEFAULT. Expected: relreplident='d'.
SELECT relname, relreplident FROM pg_class WHERE relname='field_values';

-- C3. field_values is still published (live INSERT/UPDATE refresh preserved).
--     Expected: one row.
SELECT pubname, tablename FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND tablename='field_values';

-- C4. Membership guard is present in the function body. Expected: one row, true.
SELECT proname,
       pg_get_functiondef(oid) ILIKE '%is_org_member%' AS has_membership_check
FROM pg_proc WHERE proname='move_record';
```

**Cross-org / same-org movement checks (optional, do only with test data):**
same-org same-board move via the app (Kanban drag) should still succeed and log
one `record_movement`; there is no safe way to exercise a cross-org call from
the SQL editor without seeding throwaway rows, so rely on the local rehearsal
(§ below) which asserts both. Do **not** test by moving real production
records between orgs.

### D. Rollback notes

- **`field_values` replica identity** — reversible with
  `ALTER TABLE public.field_values REPLICA IDENTITY FULL;`. Only do this if a
  future feature genuinely needs full old-row DELETE payloads (none does today),
  and understand it **re-opens the cross-org DELETE leak** — prefer a private
  broadcast channel instead.
- **`move_record` grants** — reversible with
  `GRANT EXECUTE ON FUNCTION public.move_record(UUID,UUID,UUID,public.movement_type) TO PUBLIC;`
  but **do not** — that restores the anon-callable hole. There is no legitimate
  reason to roll this back.
- **`move_record` body** — the prior definition is preserved in git
  (`20260619000000_phase34b2b_reset_default_status.sql`) if a true regression
  appears; re-applying it would remove the guards, so only do so to diagnose,
  never as a durable state.
- **Risk of rolling back:** each rollback re-introduces the exact vulnerability
  it fixed. Roll back only to unblock a confirmed functional regression, and
  re-apply the fix immediately after.

## 5. Verification queries

Pre-flight = §4A, post-migration = §4C. Keep the §4A output so the before/after
grant and replica-identity change is auditable.

## 6. Local rehearsal result

Rehearsed on a throwaway Postgres 16 cluster (mocked `auth.uid()` via a GUC,
`authenticated`/`anon`/`service_role` roles created, minimal schema mirroring
the touched objects, the **real migration file** applied). All assertions
passed:

| Test | Result |
|---|---|
| Same-org, same-board move by an org member | **PASS** — record moved, one `record_movement` logged |
| Cross-org caller (member of a different org) | **PASS** — blocked with `forbidden` (insufficient_privilege) |
| Member targeting a group in another org/board | **PASS** — blocked with `group_board_mismatch` (check_violation) |
| `anon` EXECUTE on `move_record` | **PASS** — denied |
| `PUBLIC` EXECUTE on `move_record` | **PASS** — denied |
| `authenticated` EXECUTE on `move_record` | **PASS** — allowed |
| `field_values` REPLICA IDENTITY | **PASS** — `DEFAULT` |
| `field_values` still in `supabase_realtime` | **PASS** |
| Re-apply migration (idempotency) | **PASS** — no error, grants unchanged |

## 7. Remaining risks

- **`p_moved_by` is still caller-supplied** — a legitimate org member could log
  a movement attributed to another user *within their own org*. Intra-org
  attribution only (the cross-org hole is closed); the sibling
  `move_record_to_board` has the same property. Not changed here to keep
  behavior identical; candidate for a later `auth.uid()`-based tightening.
- **Other Realtime-published tables share the DELETE-leak class** — `records`,
  `tasks`, `board_groups`, `fields`, `activities` are also FULL + published and
  also leak on DELETE. They are **out of scope** for this narrow PR because
  their `useBoardRealtime` subscriptions use `board_id` **filters**, and a
  filtered DELETE binding needs the old row to evaluate the filter — so
  switching them to `REPLICA IDENTITY DEFAULT` would silently stop
  delete-driven refreshes. The correct fix there is private broadcast-from-db
  channels (a design change), tracked as a fast-follow. **Recommend a separate
  approved PR** for those; this PR fixes the one table (`field_values`) where
  the surgical switch is free (no filter, payload ignored).
- **Production drift** — the fix assumes prod matches the repo migrations
  (e.g. the phase-34B2B `move_record` body is live). §4A confirms the current
  state before applying.
- **Twilio number collision / disabled-org enforcement / RPC id-consistency
  gaps** (audit §8) are separate blockers, not part of PR 1.

## 8. Is the PR 1 blocker resolved?

**After the §4 production SQL is applied and §4C verifies**, the two critical
blockers (T1 `move_record`, T2 `field_values` DELETE leak) are **resolved**.
Until then, the repo migration is written and rehearsed but production remains
exposed — this file's status line stays "not applied" until Jason runs the
runbook and pastes back the §4C results. The broader Realtime DELETE class on
the filtered tables (§7) remains open by design and needs its own approved PR.
