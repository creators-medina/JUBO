-- ─────────────────────────────────────────────────────────────────────────
-- Phase 34B.2b — Reset the default workflow Status when a record moves.
--
-- The default workflow Status (fields.is_default_status) represents progress
-- WITHIN the current stage, so it clears whenever a record enters a new
-- group/board. Cleared by deleting the field_values row in SQL — silently (no
-- record.field_changed event), so it never re-triggers a status automation.
--
-- Only the default status field is cleared; additional status / select / other
-- fields are untouched. field_values for other fields are preserved.
-- ─────────────────────────────────────────────────────────────────────────

-- Helper: clear the given board's default status value for one record (silent).
CREATE OR REPLACE FUNCTION public.reset_default_status(p_record_id UUID, p_board_id UUID)
RETURNS VOID AS $$
DECLARE
  v_field_id UUID;
BEGIN
  SELECT id INTO v_field_id
    FROM public.fields WHERE board_id = p_board_id AND is_default_status LIMIT 1;
  IF v_field_id IS NULL THEN RETURN; END IF;
  DELETE FROM public.field_values WHERE field_id = v_field_id AND record_id = p_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.reset_default_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reset_default_status(UUID, UUID) TO authenticated, service_role;

-- ── Same-board move: reset the (unchanged) board's default status ────────────
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
BEGIN
  SELECT group_id, organization_id, board_id
  INTO v_from_group_id, v_org_id, v_board_id
  FROM public.records
  WHERE id = p_record_id;

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

-- ── Cross-board move: reset the DESTINATION board's default status (parent + subitems) ──
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
  v_def_field  UUID;
BEGIN
  SELECT organization_id, board_id, group_id
    INTO v_org, v_from_board, v_from_group
    FROM public.records WHERE id = p_record_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'record_not_found');
  END IF;

  IF NOT public.is_org_member(v_org) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT organization_id INTO v_board_org
    FROM public.boards WHERE id = p_to_board_id AND is_archived = false;
  IF v_board_org IS NULL THEN
    RETURN jsonb_build_object('error', 'board_not_found');
  END IF;
  IF v_board_org <> v_org THEN
    RETURN jsonb_build_object('error', 'cross_org');
  END IF;

  SELECT board_id INTO v_grp_board
    FROM public.board_groups WHERE id = p_to_group_id AND is_archived = false;
  IF v_grp_board IS NULL THEN
    RETURN jsonb_build_object('error', 'group_not_found');
  END IF;
  IF v_grp_board <> p_to_board_id THEN
    RETURN jsonb_build_object('error', 'group_board_mismatch');
  END IF;

  UPDATE public.records
    SET board_id = p_to_board_id, group_id = p_to_group_id, updated_at = NOW()
    WHERE id = p_record_id;

  UPDATE public.records
    SET board_id = p_to_board_id, group_id = p_to_group_id, updated_at = NOW()
    WHERE parent_record_id = p_record_id;

  INSERT INTO public.record_movements
    (organization_id, record_id, from_group_id, to_group_id, moved_by, movement_type, metadata)
  VALUES
    (v_org, p_record_id, v_from_group, p_to_group_id, p_moved_by, 'board_change',
     jsonb_build_object('from_board_id', v_from_board, 'to_board_id', p_to_board_id));

  INSERT INTO public.activities
    (organization_id, record_id, user_id, activity_type, metadata)
  VALUES
    (v_org, p_record_id, p_moved_by, 'status_change',
     jsonb_build_object(
       'movement_type', 'board_change',
       'from_board_id', v_from_board, 'to_board_id', p_to_board_id,
       'from_group_id', v_from_group, 'to_group_id', p_to_group_id));

  -- Phase 34B.2b — clear the destination board's default status for the record
  -- AND any cascaded subitems (silent — no event). Other fields untouched.
  SELECT id INTO v_def_field FROM public.fields WHERE board_id = p_to_board_id AND is_default_status LIMIT 1;
  IF v_def_field IS NOT NULL THEN
    DELETE FROM public.field_values
      WHERE field_id = v_def_field
        AND (record_id = p_record_id
             OR record_id IN (SELECT id FROM public.records WHERE parent_record_id = p_record_id));
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'from_board_id', v_from_board, 'from_group_id', v_from_group,
    'to_board_id', p_to_board_id, 'to_group_id', p_to_group_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
