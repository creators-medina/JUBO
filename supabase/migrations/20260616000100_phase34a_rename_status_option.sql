-- ─────────────────────────────────────────────────────────────────────────
-- Phase 34A — atomic status-label rename.
--
-- Renaming a status label must (a) update the field's config option label and
-- (b) cascade field_values.value_text for THAT field from the old label to the
-- new one, in a single transaction, without touching any other field. Values
-- are stored by label string, so this keeps existing records consistent.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.rename_status_option(
  p_field_id  UUID,
  p_options   JSONB,   -- the full, updated options array (with the renamed label)
  p_old_label TEXT,
  p_new_label TEXT
) RETURNS VOID AS $$
DECLARE
  v_org UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.fields WHERE id = p_field_id;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Field not found'; END IF;
  IF NOT public.is_org_member(v_org) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  -- (a) write the new options config
  UPDATE public.fields
    SET config = jsonb_set(COALESCE(config, '{}'::jsonb), '{options}', p_options), updated_at = NOW()
    WHERE id = p_field_id;

  -- (b) cascade stored values for this field only
  IF p_old_label IS DISTINCT FROM p_new_label THEN
    UPDATE public.field_values
      SET value_text = p_new_label, updated_at = NOW()
      WHERE field_id = p_field_id AND value_text = p_old_label;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.rename_status_option(UUID, JSONB, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_status_option(UUID, JSONB, TEXT, TEXT) TO authenticated;
