-- ─────────────────────────────────────────────────────────────────────────
-- Phase 18: Async Integration Runtime
--
-- Webhooks now CAPTURE a 'pending' event and return fast; an authenticated
-- worker drains pending events later (Today load / manual / command), running
-- record sync + pipeline movement + workflow execution in the member's session
-- (so auth.uid() is present and the existing engines work — no service role).
--
-- This migration adds event-processing state, lets the worker update events +
-- write external links under member RLS, and adds a minimal token-gated capture
-- RPC for the session-less webhook.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Event processing state ───────────────────────────────────────────────────
ALTER TABLE public.integration_events
  ADD COLUMN IF NOT EXISTS attempt_count          INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS processing_duration_ms  INTEGER;

CREATE INDEX IF NOT EXISTS integration_events_status_idx
  ON public.integration_events(organization_id, status, created_at);

-- The worker (authenticated member) claims + finalizes events directly.
DROP POLICY IF EXISTS integration_events_update ON public.integration_events;
CREATE POLICY integration_events_update ON public.integration_events FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- The worker links external ids → records under member RLS (Phase 17 had SELECT only).
DROP POLICY IF EXISTS external_record_links_insert ON public.external_record_links;
CREATE POLICY external_record_links_insert ON public.external_record_links FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));
DROP POLICY IF EXISTS external_record_links_update ON public.external_record_links;
CREATE POLICY external_record_links_update ON public.external_record_links FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── Token-gated capture RPC (session-less webhook) ───────────────────────────
-- Minimal privilege: only logs a pending event. All side-effects happen later in
-- the authenticated worker. Idempotent on (connection, dedupe_key).
CREATE OR REPLACE FUNCTION public.integration_capture_event(
  p_token             TEXT,
  p_external_event_id TEXT,
  p_dedupe_key        TEXT,
  p_event_type        TEXT,
  p_payload           JSONB,
  p_normalized        JSONB
) RETURNS JSONB AS $$
DECLARE
  v_org      UUID;
  v_conn     UUID;
  v_provider TEXT;
  v_status   TEXT;
  v_id       UUID;
BEGIN
  SELECT id, organization_id, provider, status
    INTO v_conn, v_org, v_provider, v_status
    FROM public.integration_connections WHERE secret_token = p_token;
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid integration token'; END IF;
  IF v_status <> 'active' THEN RAISE EXCEPTION 'connection_%', v_status; END IF;

  INSERT INTO public.integration_events
    (organization_id, integration_connection_id, provider, external_event_id, dedupe_key, event_type, payload, normalized, status)
  VALUES
    (v_org, v_conn, v_provider, p_external_event_id, p_dedupe_key, p_event_type,
     COALESCE(p_payload,'{}'::jsonb), COALESCE(p_normalized,'{}'::jsonb), 'pending')
  ON CONFLICT (integration_connection_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  -- Count receipt immediately so the connection shows live activity.
  UPDATE public.integration_connections
    SET event_count = event_count + 1, last_sync_at = NOW() WHERE id = v_conn;

  RETURN jsonb_build_object('duplicate', false, 'event_id', v_id, 'organization_id', v_org);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.integration_capture_event(TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_capture_event(TEXT,TEXT,TEXT,TEXT,JSONB,JSONB) TO anon, authenticated;
