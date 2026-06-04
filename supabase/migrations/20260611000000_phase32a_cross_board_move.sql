-- ─────────────────────────────────────────────────────────────────────────
-- Phase 32A — Cross-Board Record Movement (safe V1)
--
-- A record can move to ANOTHER board while staying the SAME record. Everything
-- keyed by record_id (notes / tasks / comms / activities / movements) stays
-- attached. field_values are NOT touched — old-board values are preserved in
-- place and simply not rendered on the destination board (reconciliation is a
-- later phase).
--
-- The same-board move_record RPC is left UNTOUCHED. This adds a sibling RPC
-- that updates board_id + group_id TOGETHER and enforces the board/group
-- invariant (a group must belong to the destination board) — the corruption
-- risk the audit flagged. Subitems cascade with their parent.
--
-- Minimal by design: one new RPC, no schema changes, no new columns. The
-- cross-board context (from/to board) is recorded in the existing
-- record_movements.metadata + activities.metadata JSONB.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.move_record_to_board(
  p_record_id   UUID,
  p_to_board_id UUID,
  p_to_group_id UUID,
  p_moved_by    UUID
)
RETURNS JSONB AS $$
DECLARE
  v_org        UUID;
  v_from_board UUID;
  v_from_group UUID;
  v_board_org  UUID;
  v_grp_board  UUID;
BEGIN
  -- Load the record's current state.
  SELECT organization_id, board_id, group_id
    INTO v_org, v_from_board, v_from_group
    FROM public.records WHERE id = p_record_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'record_not_found');
  END IF;

  -- Caller must be an ACTIVE member of the record's org (auth.uid()-scoped).
  IF NOT public.is_org_member(v_org) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  -- Destination board must exist, be live, and belong to the SAME org.
  SELECT organization_id INTO v_board_org
    FROM public.boards WHERE id = p_to_board_id AND is_archived = false;
  IF v_board_org IS NULL THEN
    RETURN jsonb_build_object('error', 'board_not_found');
  END IF;
  IF v_board_org <> v_org THEN
    RETURN jsonb_build_object('error', 'cross_org');
  END IF;

  -- INVARIANT: the destination group must belong to the destination board.
  SELECT board_id INTO v_grp_board
    FROM public.board_groups WHERE id = p_to_group_id AND is_archived = false;
  IF v_grp_board IS NULL THEN
    RETURN jsonb_build_object('error', 'group_not_found');
  END IF;
  IF v_grp_board <> p_to_board_id THEN
    RETURN jsonb_build_object('error', 'group_board_mismatch');
  END IF;

  -- Move the record (board + group together).
  UPDATE public.records
    SET board_id = p_to_board_id, group_id = p_to_group_id, updated_at = NOW()
    WHERE id = p_record_id;

  -- Cascade subitems so children never orphan on the old board.
  UPDATE public.records
    SET board_id = p_to_board_id, group_id = p_to_group_id, updated_at = NOW()
    WHERE parent_record_id = p_record_id;

  -- Movement history (existing table; board ids ride in metadata JSONB).
  INSERT INTO public.record_movements
    (organization_id, record_id, from_group_id, to_group_id, moved_by, movement_type, metadata)
  VALUES
    (v_org, p_record_id, v_from_group, p_to_group_id, p_moved_by, 'board_change',
     jsonb_build_object('from_board_id', v_from_board, 'to_board_id', p_to_board_id));

  -- Timeline activity.
  INSERT INTO public.activities
    (organization_id, record_id, user_id, activity_type, metadata)
  VALUES
    (v_org, p_record_id, p_moved_by, 'status_change',
     jsonb_build_object(
       'movement_type', 'board_change',
       'from_board_id', v_from_board, 'to_board_id', p_to_board_id,
       'from_group_id', v_from_group, 'to_group_id', p_to_group_id));

  RETURN jsonb_build_object(
    'ok', true,
    'from_board_id', v_from_board, 'from_group_id', v_from_group,
    'to_board_id', p_to_board_id, 'to_group_id', p_to_group_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.move_record_to_board(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.move_record_to_board(UUID, UUID, UUID, UUID) TO authenticated;
