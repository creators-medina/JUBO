-- ─────────────────────────────────────────────────────────────────────────
-- Phase 17: Integration Sync Engine (inbound webhooks)
--
--   integration_connections — per-org connection (provider + secret token)
--   integration_events      — durable raw + normalized ingestion log (audit/replay)
--   external_record_links   — external_id → Jubo record mapping (dedupe across syncs)
--
-- THE KEY SECURITY MODEL: webhooks arrive with NO user session, so auth.uid()
-- is NULL. Instead, the inbound secret TOKEN is the credential. All write paths
-- go through SECURITY DEFINER RPCs that derive the org FROM THE TOKEN (never
-- trusting a caller-supplied org) and are granted to `anon`. No service-role
-- key is needed or exposed. Setup/admin UI still uses normal is_org_member RLS.
-- ─────────────────────────────────────────────────────────────────────────

-- ── integration_connections ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_connections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,                     -- arive_zapier | custom_webhook | ...
  status           TEXT NOT NULL DEFAULT 'active',    -- active | paused | revoked
  display_name     TEXT NOT NULL,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  secret_token     TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  event_count      INTEGER NOT NULL DEFAULT 0,
  last_sync_at     TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS integration_connections_org_idx ON public.integration_connections(organization_id);

CREATE TRIGGER integration_connections_set_updated_at
  BEFORE UPDATE ON public.integration_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.integration_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_connections_select ON public.integration_connections FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY integration_connections_insert ON public.integration_connections FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY integration_connections_update ON public.integration_connections FOR UPDATE
  USING (public.is_org_member(organization_id));
CREATE POLICY integration_connections_delete ON public.integration_connections FOR DELETE
  USING (public.is_org_admin(organization_id));

-- ── integration_events (durable ingestion log) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_events (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  integration_connection_id UUID REFERENCES public.integration_connections(id) ON DELETE SET NULL,
  provider                  TEXT NOT NULL,
  external_event_id         TEXT,
  dedupe_key                TEXT NOT NULL,
  event_type                TEXT,
  payload                   JSONB NOT NULL DEFAULT '{}'::jsonb,
  normalized                JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                    TEXT NOT NULL DEFAULT 'received', -- received | processed | failed | duplicate
  error_message             TEXT,
  record_id                 UUID REFERENCES public.records(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at              TIMESTAMPTZ,
  UNIQUE (integration_connection_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS integration_events_org_idx  ON public.integration_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS integration_events_conn_idx ON public.integration_events(integration_connection_id, created_at DESC);

ALTER TABLE public.integration_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_events_select ON public.integration_events FOR SELECT
  USING (public.is_org_member(organization_id));

-- ── external_record_links ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.external_record_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,
  external_id      TEXT NOT NULL,
  record_id        UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  entity_type      TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider, external_id)
);

CREATE INDEX IF NOT EXISTS external_record_links_record_idx ON public.external_record_links(record_id);

ALTER TABLE public.external_record_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY external_record_links_select ON public.external_record_links FOR SELECT
  USING (public.is_org_member(organization_id));

-- ═════════════════════════════════════════════════════════════════════════
-- Token-gated SECURITY DEFINER RPCs (callable by anon — token IS the auth)
-- ═════════════════════════════════════════════════════════════════════════

-- Resolve a connection from its secret token. Returns nothing if invalid.
CREATE OR REPLACE FUNCTION public.integration_resolve(p_token TEXT)
RETURNS TABLE (connection_id UUID, organization_id UUID, provider TEXT, status TEXT, display_name TEXT, last_sync_at TIMESTAMPTZ)
AS $$
BEGIN
  RETURN QUERY
  SELECT c.id, c.organization_id, c.provider, c.status, c.display_name, c.last_sync_at
  FROM public.integration_connections c
  WHERE c.secret_token = p_token
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.integration_resolve(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_resolve(TEXT) TO anon, authenticated;

-- Board context for a target board slug: board id, first group id, and the
-- board's fields (id/slug/type) so the caller can map+coerce field values.
CREATE OR REPLACE FUNCTION public.integration_board_context(p_token TEXT, p_board_slug TEXT)
RETURNS JSONB AS $$
DECLARE
  v_org UUID;
  v_board_id UUID;
  v_group_id UUID;
  v_fields JSONB;
BEGIN
  SELECT organization_id INTO v_org FROM public.integration_connections WHERE secret_token = p_token AND status = 'active';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid or inactive token'; END IF;

  SELECT id INTO v_board_id FROM public.boards
    WHERE organization_id = v_org AND slug = p_board_slug AND is_archived = FALSE LIMIT 1;
  IF v_board_id IS NULL THEN
    -- fall back to any non-archived board
    SELECT id INTO v_board_id FROM public.boards WHERE organization_id = v_org AND is_archived = FALSE ORDER BY created_at LIMIT 1;
  END IF;
  IF v_board_id IS NULL THEN RETURN jsonb_build_object('error', 'no_board'); END IF;

  SELECT id INTO v_group_id FROM public.board_groups WHERE board_id = v_board_id AND is_archived = FALSE ORDER BY position LIMIT 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', f.id, 'slug', f.slug, 'field_type', f.field_type)), '[]'::jsonb)
    INTO v_fields FROM public.fields f WHERE f.board_id = v_board_id;

  RETURN jsonb_build_object('board_id', v_board_id, 'group_id', v_group_id, 'fields', v_fields);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.integration_board_context(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_board_context(TEXT, TEXT) TO anon, authenticated;

-- The workhorse: idempotent ingest. Logs the event, matches/creates/updates a
-- record, writes field values, links the external id, logs an activity, and
-- updates the event + connection. Returns a JSONB result describing what happened.
--
-- p_field_values: jsonb array of { field_id, value_text?, value_number?, value_boolean?, value_date?, value_json? }
CREATE OR REPLACE FUNCTION public.integration_ingest(
  p_token             TEXT,
  p_external_event_id TEXT,
  p_dedupe_key        TEXT,
  p_event_type        TEXT,
  p_entity_type       TEXT,
  p_external_id       TEXT,
  p_board_id          UUID,
  p_group_id          UUID,
  p_title             TEXT,
  p_record_type       TEXT,
  p_email             TEXT,
  p_phone             TEXT,
  p_field_values      JSONB,
  p_payload           JSONB,
  p_normalized        JSONB
) RETURNS JSONB AS $$
DECLARE
  v_org UUID;
  v_conn UUID;
  v_provider TEXT;
  v_event_id UUID;
  v_record_id UUID;
  v_matched_on TEXT := NULL;
  v_created BOOLEAN := FALSE;
  v_email_field UUID;
  v_phone_field UUID;
  v_phone_digits TEXT;
  fv JSONB;
BEGIN
  -- 1. Authenticate by token → derive org (never trust caller-supplied org).
  SELECT id, organization_id, provider INTO v_conn, v_org, v_provider
    FROM public.integration_connections WHERE secret_token = p_token AND status = 'active';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid or inactive token'; END IF;

  -- 2. Verify the board belongs to this org (defends against id tampering).
  IF p_board_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.boards WHERE id = p_board_id AND organization_id = v_org) THEN
    RAISE EXCEPTION 'Target board not found for organization';
  END IF;

  -- 3. Idempotency: insert the event; a conflict on (conn, dedupe_key) = duplicate.
  INSERT INTO public.integration_events
    (organization_id, integration_connection_id, provider, external_event_id, dedupe_key, event_type, payload, normalized, status)
  VALUES
    (v_org, v_conn, v_provider, p_external_event_id, p_dedupe_key, p_event_type, COALESCE(p_payload,'{}'::jsonb), COALESCE(p_normalized,'{}'::jsonb), 'received')
  ON CONFLICT (integration_connection_id, dedupe_key) DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN jsonb_build_object('duplicate', true);
  END IF;

  -- 4. Resolve dedupe field ids (email/phone) for this board.
  SELECT id INTO v_email_field FROM public.fields WHERE board_id = p_board_id AND field_type = 'email' LIMIT 1;
  SELECT id INTO v_phone_field FROM public.fields WHERE board_id = p_board_id AND field_type = 'phone' LIMIT 1;
  v_phone_digits := NULLIF(regexp_replace(COALESCE(p_phone,''), '\D', '', 'g'), '');

  -- 5. Match: external link → email → phone → exact title.
  SELECT record_id INTO v_record_id FROM public.external_record_links
    WHERE organization_id = v_org AND provider = v_provider AND external_id = p_external_id AND p_external_id IS NOT NULL LIMIT 1;
  IF v_record_id IS NOT NULL THEN v_matched_on := 'external_id'; END IF;

  IF v_record_id IS NULL AND v_email_field IS NOT NULL AND p_email IS NOT NULL THEN
    SELECT fv2.record_id INTO v_record_id FROM public.field_values fv2
      JOIN public.records r ON r.id = fv2.record_id
      WHERE fv2.field_id = v_email_field AND lower(fv2.value_text) = lower(p_email) AND r.is_archived = FALSE LIMIT 1;
    IF v_record_id IS NOT NULL THEN v_matched_on := 'email'; END IF;
  END IF;

  IF v_record_id IS NULL AND v_phone_field IS NOT NULL AND v_phone_digits IS NOT NULL AND length(v_phone_digits) >= 7 THEN
    SELECT fv2.record_id INTO v_record_id FROM public.field_values fv2
      JOIN public.records r ON r.id = fv2.record_id
      WHERE fv2.field_id = v_phone_field AND regexp_replace(COALESCE(fv2.value_text,''), '\D', '', 'g') = v_phone_digits AND r.is_archived = FALSE LIMIT 1;
    IF v_record_id IS NOT NULL THEN v_matched_on := 'phone'; END IF;
  END IF;

  IF v_record_id IS NULL AND p_title IS NOT NULL THEN
    SELECT id INTO v_record_id FROM public.records
      WHERE board_id = p_board_id AND lower(title) = lower(p_title) AND is_archived = FALSE LIMIT 1;
    IF v_record_id IS NOT NULL THEN v_matched_on := 'name'; END IF;
  END IF;

  -- 6. Create or update.
  IF v_record_id IS NULL THEN
    INSERT INTO public.records (organization_id, board_id, group_id, title, record_type)
    VALUES (v_org, p_board_id, p_group_id, COALESCE(NULLIF(p_title,''), 'Imported record'),
            COALESCE(p_record_type, 'lead')::public.record_type)
    RETURNING id INTO v_record_id;
    v_created := TRUE;
  ELSE
    -- light update: refresh title + touch updated_at
    UPDATE public.records SET title = COALESCE(NULLIF(p_title,''), title), updated_at = NOW() WHERE id = v_record_id;
  END IF;

  -- 7. Field values (upsert each, respecting UNIQUE(field_id, record_id)).
  IF p_field_values IS NOT NULL THEN
    FOR fv IN SELECT * FROM jsonb_array_elements(p_field_values)
    LOOP
      INSERT INTO public.field_values (field_id, record_id, value_text, value_number, value_boolean, value_date, value_json)
      VALUES (
        (fv->>'field_id')::uuid, v_record_id,
        fv->>'value_text',
        CASE WHEN fv ? 'value_number' AND fv->>'value_number' IS NOT NULL THEN (fv->>'value_number')::numeric ELSE NULL END,
        CASE WHEN fv ? 'value_boolean' AND fv->>'value_boolean' IS NOT NULL THEN (fv->>'value_boolean')::boolean ELSE NULL END,
        CASE WHEN fv ? 'value_date' AND fv->>'value_date' IS NOT NULL THEN (fv->>'value_date')::timestamptz ELSE NULL END,
        CASE WHEN fv ? 'value_json' THEN fv->'value_json' ELSE NULL END
      )
      ON CONFLICT (field_id, record_id) DO UPDATE SET
        value_text = EXCLUDED.value_text, value_number = EXCLUDED.value_number,
        value_boolean = EXCLUDED.value_boolean, value_date = EXCLUDED.value_date,
        value_json = EXCLUDED.value_json, updated_at = NOW();
    END LOOP;
  END IF;

  -- 8. External link (so future syncs find the same record).
  IF p_external_id IS NOT NULL THEN
    INSERT INTO public.external_record_links (organization_id, provider, external_id, record_id, entity_type)
    VALUES (v_org, v_provider, p_external_id, v_record_id, p_entity_type)
    ON CONFLICT (organization_id, provider, external_id) DO UPDATE SET record_id = EXCLUDED.record_id, updated_at = NOW();
  END IF;

  -- 9. Activity + event + connection bookkeeping.
  INSERT INTO public.activities (organization_id, record_id, activity_type, content, metadata)
  VALUES (v_org, v_record_id, 'integration_event',
          CASE WHEN v_created THEN 'Synced new record from ' || v_provider ELSE 'Updated from ' || v_provider END,
          jsonb_build_object('provider', v_provider, 'event_type', p_event_type, 'created', v_created, 'matched_on', v_matched_on));

  UPDATE public.integration_events SET status = 'processed', record_id = v_record_id, processed_at = NOW() WHERE id = v_event_id;
  UPDATE public.integration_connections SET event_count = event_count + 1, last_sync_at = NOW() WHERE id = v_conn;

  RETURN jsonb_build_object(
    'duplicate', false, 'event_id', v_event_id, 'record_id', v_record_id,
    'created', v_created, 'matched_on', v_matched_on
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.integration_ingest(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_ingest(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,UUID,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB,JSONB) TO anon, authenticated;

-- Mark an event failed (used when normalization/processing throws before ingest).
CREATE OR REPLACE FUNCTION public.integration_log_failure(
  p_token TEXT, p_dedupe_key TEXT, p_event_type TEXT, p_payload JSONB, p_error TEXT
) RETURNS UUID AS $$
DECLARE v_org UUID; v_conn UUID; v_provider TEXT; v_id UUID;
BEGIN
  SELECT id, organization_id, provider INTO v_conn, v_org, v_provider
    FROM public.integration_connections WHERE secret_token = p_token AND status = 'active';
  IF v_org IS NULL THEN RAISE EXCEPTION 'Invalid or inactive token'; END IF;

  INSERT INTO public.integration_events
    (organization_id, integration_connection_id, provider, dedupe_key, event_type, payload, status, error_message, processed_at)
  VALUES (v_org, v_conn, v_provider, p_dedupe_key, p_event_type, COALESCE(p_payload,'{}'::jsonb), 'failed', p_error, NOW())
  ON CONFLICT (integration_connection_id, dedupe_key) DO UPDATE SET status='failed', error_message = EXCLUDED.error_message
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.integration_log_failure(TEXT,TEXT,TEXT,JSONB,TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integration_log_failure(TEXT,TEXT,TEXT,JSONB,TEXT) TO anon, authenticated;
