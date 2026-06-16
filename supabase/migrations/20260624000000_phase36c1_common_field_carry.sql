-- ─────────────────────────────────────────────────────────────────────────
-- Phase 36C-1 — Common field carry: empty-destination slice.
--
-- On a CROSS-BOARD move, copy each source field's value into the destination
-- board's field with the SAME common_field_key_id — but ONLY when the
-- destination is empty (pure insert, never an overwrite). Source-empty values
-- are skipped entirely; populated destinations are skipped (conflict handling is
-- 36C-2). Parent record only. Everything is written silently in SQL (no
-- record.field_changed / record.updated events), mirroring the 34B.2b pattern,
-- so destination automations never fire as a side effect.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Carry audit (log every evaluated key, every outcome incl. skips) ─────────
CREATE TABLE IF NOT EXISTS public.common_field_carry_audit (
  id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id                          UUID REFERENCES public.records(id) ON DELETE CASCADE,
  from_board_id                      UUID,
  to_board_id                        UUID,
  common_field_key_id                UUID,
  source_field_id                    UUID,
  destination_field_id               UUID,
  source_value_snapshot              JSONB,
  destination_value_before_snapshot  JSONB,
  outcome                            TEXT NOT NULL,   -- carried | skipped_no_destination_field | skipped_empty_source | skipped_destination_populated
  label_warning                      BOOLEAN NOT NULL DEFAULT FALSE,
  reason                             TEXT,
  actor_user_id                      UUID,
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_cfca_record ON public.common_field_carry_audit(record_id);
CREATE INDEX IF NOT EXISTS idx_cfca_org ON public.common_field_carry_audit(organization_id);

ALTER TABLE public.common_field_carry_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfca_all_org_members" ON public.common_field_carry_audit
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── Shared, silent carry helper ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.carry_common_fields(
  p_record_id      UUID,
  p_from_board_id  UUID,
  p_to_board_id    UUID,
  p_actor_user_id  UUID
)
RETURNS VOID AS $$
DECLARE
  v_org        UUID;
  v_carried    INT := 0;
  v_skipped    INT := 0;
  src          RECORD;
  v_dest_field UUID;
  v_dest_cfg   JSONB;
  v_dest_fv    public.field_values%ROWTYPE;
  v_dest_found BOOLEAN;
  v_dest_before JSONB;
  v_src_empty  BOOLEAN;
  v_dest_empty BOOLEAN;
  v_outcome    TEXT;
  v_reason     TEXT;
  v_label_warn BOOLEAN;
BEGIN
  -- Cross-board only. No-op for same-board / missing-board moves.
  IF p_from_board_id IS NULL OR p_to_board_id IS NULL OR p_from_board_id = p_to_board_id THEN RETURN; END IF;

  SELECT organization_id INTO v_org FROM public.records WHERE id = p_record_id;
  IF v_org IS NULL THEN RETURN; END IF;

  -- Authorization: service role (integration) or a member of the record's org.
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_org_member(v_org) THEN RETURN; END IF;

  FOR src IN
    SELECT f.id AS field_id, f.common_field_key_id AS key_id, k.data_type AS data_type,
           fv.value_text, fv.value_number, fv.value_boolean, fv.value_date, fv.value_json
    FROM public.fields f
    JOIN public.common_field_keys k ON k.id = f.common_field_key_id
    LEFT JOIN public.field_values fv ON fv.field_id = f.id AND fv.record_id = p_record_id
    WHERE f.board_id = p_from_board_id AND f.common_field_key_id IS NOT NULL
  LOOP
    v_dest_field := NULL; v_dest_cfg := NULL; v_dest_found := FALSE; v_dest_before := NULL;
    v_outcome := NULL; v_reason := NULL; v_label_warn := FALSE;

    -- Source emptiness (all value columns empty, incl. empty json array/object).
    v_src_empty := (COALESCE(btrim(src.value_text), '') = '')
                   AND src.value_number IS NULL
                   AND src.value_boolean IS NULL
                   AND src.value_date IS NULL
                   AND (src.value_json IS NULL OR src.value_json = '[]'::jsonb OR src.value_json = '{}'::jsonb);

    -- Destination field for this key on the to-board (≤1 per unique index).
    SELECT id, config INTO v_dest_field, v_dest_cfg
    FROM public.fields
    WHERE board_id = p_to_board_id AND common_field_key_id = src.key_id
    LIMIT 1;

    IF v_src_empty THEN
      v_outcome := 'skipped_empty_source';
      v_reason  := 'source value empty — nothing to carry';
    ELSIF v_dest_field IS NULL THEN
      v_outcome := 'skipped_no_destination_field';
      v_reason  := 'destination board has no field for this common key';
    ELSE
      SELECT * INTO v_dest_fv FROM public.field_values WHERE field_id = v_dest_field AND record_id = p_record_id;
      v_dest_found := FOUND;
      IF v_dest_found THEN
        v_dest_before := jsonb_build_object(
          'value_text', v_dest_fv.value_text, 'value_number', v_dest_fv.value_number,
          'value_boolean', v_dest_fv.value_boolean, 'value_date', v_dest_fv.value_date, 'value_json', v_dest_fv.value_json);
        v_dest_empty := (COALESCE(btrim(v_dest_fv.value_text), '') = '')
                        AND v_dest_fv.value_number IS NULL
                        AND v_dest_fv.value_boolean IS NULL
                        AND v_dest_fv.value_date IS NULL
                        AND (v_dest_fv.value_json IS NULL OR v_dest_fv.value_json = '[]'::jsonb OR v_dest_fv.value_json = '{}'::jsonb);
      ELSE
        v_dest_empty := TRUE;
      END IF;

      IF NOT v_dest_empty THEN
        v_outcome := 'skipped_destination_populated';
        v_reason  := 'destination already has a value (conflict; 36C-2)';
      ELSE
        -- select label warning: carried label absent from destination options.
        IF src.data_type = 'select' AND COALESCE(btrim(src.value_text), '') <> '' THEN
          IF NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(COALESCE(v_dest_cfg->'options', '[]'::jsonb)) opt
            WHERE (CASE WHEN jsonb_typeof(opt) = 'string' THEN opt #>> '{}' ELSE opt ->> 'label' END) = src.value_text
          ) THEN
            v_label_warn := TRUE;
          END IF;
        END IF;

        -- Copy whichever columns the source actually has populated (defensive).
        INSERT INTO public.field_values (field_id, record_id, value_text, value_number, value_boolean, value_date, value_json)
        VALUES (v_dest_field, p_record_id, src.value_text, src.value_number, src.value_boolean, src.value_date, src.value_json)
        ON CONFLICT (field_id, record_id) DO UPDATE SET
          value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
          value_boolean = EXCLUDED.value_boolean, value_date = EXCLUDED.value_date,
          value_json = EXCLUDED.value_json, updated_at = NOW();

        v_outcome := 'carried';
        v_reason  := CASE WHEN v_label_warn THEN 'carried into empty destination (label not in destination options)'
                          ELSE 'carried into empty destination' END;
      END IF;
    END IF;

    INSERT INTO public.common_field_carry_audit
      (organization_id, record_id, from_board_id, to_board_id, common_field_key_id,
       source_field_id, destination_field_id, source_value_snapshot, destination_value_before_snapshot,
       outcome, label_warning, reason, actor_user_id)
    VALUES
      (v_org, p_record_id, p_from_board_id, p_to_board_id, src.key_id,
       src.field_id, v_dest_field,
       jsonb_build_object('value_text', src.value_text, 'value_number', src.value_number,
                          'value_boolean', src.value_boolean, 'value_date', src.value_date, 'value_json', src.value_json),
       v_dest_before, v_outcome, v_label_warn, v_reason, p_actor_user_id);

    IF v_outcome = 'carried' THEN v_carried := v_carried + 1; ELSE v_skipped := v_skipped + 1; END IF;
  END LOOP;

  -- One silent summary activity per move (only when at least one key was evaluated).
  IF (v_carried + v_skipped) > 0 THEN
    INSERT INTO public.activities (organization_id, record_id, user_id, activity_type, content, metadata)
    VALUES (
      v_org, p_record_id, p_actor_user_id, 'field_change',
      'Carried ' || v_carried || ' common field' || CASE WHEN v_carried = 1 THEN '' ELSE 's' END
        || CASE WHEN v_skipped > 0 THEN ', skipped ' || v_skipped ELSE '' END || '.',
      jsonb_build_object('carry', true, 'carried', v_carried, 'skipped', v_skipped,
                         'from_board_id', p_from_board_id, 'to_board_id', p_to_board_id));
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.carry_common_fields(UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.carry_common_fields(UUID, UUID, UUID, UUID) TO authenticated, service_role;

-- ── Wire carry into move_record_to_board (UI / bulk path) ────────────────────
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

  -- Phase 34B.2b — clear the destination board's default status (record + subitems).
  SELECT id INTO v_def_field FROM public.fields WHERE board_id = p_to_board_id AND is_default_status LIMIT 1;
  IF v_def_field IS NOT NULL THEN
    DELETE FROM public.field_values
      WHERE field_id = v_def_field
        AND (record_id = p_record_id
             OR record_id IN (SELECT id FROM public.records WHERE parent_record_id = p_record_id));
  END IF;

  -- Phase 36C-1 — carry common fields into empty destination fields (parent only, silent).
  PERFORM public.carry_common_fields(p_record_id, v_from_board, p_to_board_id, p_moved_by);

  RETURN jsonb_build_object(
    'ok', true,
    'from_board_id', v_from_board, 'from_group_id', v_from_group,
    'to_board_id', p_to_board_id, 'to_group_id', p_to_group_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
