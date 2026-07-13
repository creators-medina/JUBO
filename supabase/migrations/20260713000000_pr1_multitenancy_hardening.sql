-- ─────────────────────────────────────────────────────────────────────────
-- PR 1 — Multi-Tenancy Critical Hardening (Market Readiness Audit T1 + T2)
--
-- Two security fixes, no user-facing behavior change:
--
--   1. Harden the same-board move_record() RPC. It was SECURITY DEFINER with
--      NO membership check and NO grant management — so under Postgres' default
--      "EXECUTE to PUBLIC" it was callable by anon/authenticated for ANY record
--      in ANY org (a cross-tenant write/delete primitive). This aligns it with
--      its already-safe sibling move_record_to_board() (phase 32A): active-org
--      membership check + destination-group integrity check, then REVOKE from
--      PUBLIC and GRANT only to authenticated. Legitimate same-board moves are
--      unchanged; illegitimate/cross-org calls now raise instead of succeeding.
--
--   2. Close the Realtime DELETE leak on field_values. Supabase Realtime does
--      NOT apply RLS to DELETE events; with REPLICA IDENTITY FULL the deleted
--      row's full contents (names, phones, loan amounts) were broadcast to any
--      subscriber, cross-org. Switching field_values to REPLICA IDENTITY DEFAULT
--      makes DELETE events carry only the primary key (id) — nothing sensitive
--      leaves the org. field_values stays in the publication, so teammates still
--      get live INSERT/UPDATE refreshes (those ARE RLS-filtered per subscriber),
--      and the board realtime hook ignores the event payload entirely (it only
--      calls router.refresh()), so live-refresh behavior is unchanged.
--
-- Idempotent: CREATE OR REPLACE / REVOKE / GRANT / ALTER … REPLICA IDENTITY are
-- all safe to re-run. Touches no records, no data, no unrelated policies/RPCs.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Harden the same-board move_record() RPC ──────────────────────────────
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
  -- Resolve the record's org + board from the record itself (authoritative;
  -- never trust caller-supplied org/board).
  SELECT group_id, organization_id, board_id
    INTO v_from_group_id, v_org_id, v_board_id
    FROM public.records
    WHERE id = p_record_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Tenant isolation: the caller must be an ACTIVE member of the record's org.
  -- (is_org_member reads auth.uid() from the request JWT even inside a SECURITY
  -- DEFINER body — the same mechanism move_record_to_board relies on.)
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Destination integrity: the target group must exist, be live, and belong to
  -- the SAME board as the record (this RPC is the same-board stage move). This
  -- blocks cross-org / cross-board targets AND prevents a desynced group/board
  -- state. Legitimate Kanban drag, milestone advance, and same-board workflow
  -- moves always pass a live group on the record's own board, so this is
  -- behavior-preserving.
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

  -- Phase 34B.2b — reset the default workflow status for the new stage (silent).
  PERFORM public.reset_default_status(p_record_id, v_board_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove the unsafe default PUBLIC grant; allow only signed-in users (matches
-- move_record_to_board, phase 32A). anon can no longer reach this function.
REVOKE ALL ON FUNCTION public.move_record(UUID, UUID, UUID, public.movement_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_record(UUID, UUID, UUID, public.movement_type) TO authenticated;

-- ── 2. Close the Realtime DELETE leak on field_values ───────────────────────
-- DELETE events now broadcast only the primary key, not the full deleted row.
ALTER TABLE public.field_values REPLICA IDENTITY DEFAULT;
