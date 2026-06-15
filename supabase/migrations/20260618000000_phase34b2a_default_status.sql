-- ─────────────────────────────────────────────────────────────────────────
-- Phase 34B.2a — Default workflow Status field (identity + ubiquity).
--
-- Every board gets exactly one "default workflow status" field: a real
-- field_type='status' field that represents progress in the current stage and
-- is the one automations default to. Marked by fields.is_default_status, with a
-- partial unique index enforcing at most one per board. Additional status
-- fields stay normal (is_default_status=false).
--
-- Backfill is additive: promote an existing status field, else create one.
-- Nothing is deleted, renamed, or cleared. No field_values / move changes.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.fields
  ADD COLUMN IF NOT EXISTS is_default_status BOOLEAN NOT NULL DEFAULT false;

-- At most one default status field per board.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fields_default_status
  ON public.fields(board_id) WHERE is_default_status;

-- Backfill: ensure every board has exactly one default status field.
DO $$
DECLARE
  b           RECORD;
  v_field_id  UUID;
  v_slug      TEXT;
  v_min_pos   INT;
  v_opts      JSONB;
BEGIN
  FOR b IN SELECT id, organization_id FROM public.boards LOOP
    -- Already has a default? skip.
    IF EXISTS (SELECT 1 FROM public.fields WHERE board_id = b.id AND is_default_status) THEN
      CONTINUE;
    END IF;

    -- Promote the best existing status field (prefer one named/slugged 'status').
    SELECT id INTO v_field_id FROM public.fields
      WHERE board_id = b.id AND field_type = 'status'
      ORDER BY (CASE WHEN slug = 'status' OR lower(name) = 'status' THEN 0 ELSE 1 END), position ASC
      LIMIT 1;
    IF v_field_id IS NOT NULL THEN
      UPDATE public.fields SET is_default_status = true WHERE id = v_field_id;
      CONTINUE;
    END IF;

    -- Otherwise create one, positioned first (min position − 1).
    SELECT COALESCE(MIN(position), 0) - 1 INTO v_min_pos FROM public.fields WHERE board_id = b.id;
    v_slug := CASE WHEN EXISTS (SELECT 1 FROM public.fields WHERE board_id = b.id AND slug = 'status')
                   THEN 'workflow_status' ELSE 'status' END;
    v_opts := jsonb_build_array(
      jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Not Started',   'color', '#64748b'),
      jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Working On It', 'color', '#f59e0b'),
      jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Stuck',         'color', '#ef4444'),
      jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Done',          'color', '#10b981'),
      jsonb_build_object('id', gen_random_uuid()::text, 'label', 'Pending',       'color', '#f97316')
    );
    INSERT INTO public.fields
      (organization_id, board_id, name, slug, field_type, config, position, is_default_status)
    VALUES
      (b.organization_id, b.id, 'Status', v_slug, 'status', jsonb_build_object('options', v_opts), v_min_pos, true);
  END LOOP;
END $$;
