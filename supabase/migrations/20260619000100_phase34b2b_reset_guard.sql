-- ─────────────────────────────────────────────────────────────────────────
-- Phase 34B.2b — authorize reset_default_status.
--
-- The helper is SECURITY DEFINER and is called both from the move RPCs (under a
-- normal user session) and from the integration runtime (service-role admin
-- client). Guard against direct cross-tenant calls: only the service role or an
-- active member of the board's org may clear a record's default status.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_default_status(p_record_id UUID, p_board_id UUID)
RETURNS VOID AS $$
DECLARE
  v_field_id UUID;
  v_org      UUID;
BEGIN
  SELECT organization_id INTO v_org FROM public.boards WHERE id = p_board_id;
  IF v_org IS NULL THEN RETURN; END IF;

  -- Cron/integration service role, or an org member of the board's org. Anyone
  -- else is a silent no-op (no cross-tenant writes).
  IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_org_member(v_org) THEN
    RETURN;
  END IF;

  SELECT id INTO v_field_id
    FROM public.fields WHERE board_id = p_board_id AND is_default_status LIMIT 1;
  IF v_field_id IS NULL THEN RETURN; END IF;
  DELETE FROM public.field_values WHERE field_id = v_field_id AND record_id = p_record_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
