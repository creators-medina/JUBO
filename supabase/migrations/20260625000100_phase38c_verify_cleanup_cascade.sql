-- ─────────────────────────────────────────────────────────────────────────
-- Phase 38C — EXERCISE the apply cleanup primitive (board hard-delete cascade).
--
-- The recoverable-apply cleanup deletes every board it created; this must remove
-- the board's groups + fields too. This migration proves that cascade at the DB
-- level: create a throwaway board + group + field, hard-delete the board, and
-- assert the children are gone. It cleans up after itself (the board it creates
-- is the board it deletes) and RAISES if the cascade ever fails to remove them.
-- Net effect on production data: zero.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_org   UUID;
  v_board UUID;
  v_groups_after INT;
  v_fields_after INT;
BEGIN
  SELECT id INTO v_org FROM public.organizations LIMIT 1;
  IF v_org IS NULL THEN
    RAISE NOTICE 'phase38c cleanup-cascade check: skipped (no organizations)';
    RETURN;
  END IF;

  INSERT INTO public.boards (organization_id, name, slug, board_type)
  VALUES (v_org, '__bp_cleanup_probe__', '__bp_cleanup_probe__', 'custom')
  RETURNING id INTO v_board;

  INSERT INTO public.board_groups (board_id, name, position) VALUES (v_board, 'Probe Group', 0);
  INSERT INTO public.fields (organization_id, board_id, name, slug, field_type)
  VALUES (v_org, v_board, 'Probe Field', 'probe_field', 'text');

  -- The cleanup primitive: hard-delete the board.
  DELETE FROM public.boards WHERE id = v_board;

  SELECT count(*) INTO v_groups_after FROM public.board_groups WHERE board_id = v_board;
  SELECT count(*) INTO v_fields_after FROM public.fields WHERE board_id = v_board;

  IF v_groups_after <> 0 OR v_fields_after <> 0 THEN
    RAISE EXCEPTION 'phase38c cleanup-cascade FAILED: % group(s), % field(s) survived board delete', v_groups_after, v_fields_after;
  END IF;

  RAISE NOTICE 'phase38c cleanup-cascade check: PASSED (board delete removed groups + fields)';
END $$;
