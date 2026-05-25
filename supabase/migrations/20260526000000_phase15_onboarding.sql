-- ─────────────────────────────────────────────────────────────────────────
-- Phase 15: LO Onboarding System (workspace provisioning)
--
--   onboarding_profiles      — one per org: answers + provisioning state
--   setup_checklist_items    — operational activation tracking (one row/item)
--   integration_preferences  — saved integration intent (connect-later/etc)
--   onboarding_uploads       — import file metadata (mapping engine = Phase 16)
--
-- These tables only STORE onboarding answers + activation state. The actual
-- workspace (boards/dashboards/goals/workflows) is provisioned through the
-- existing engines (features/boards, /dashboards, /goals, /workflows) — no
-- board/dashboard/goal logic is duplicated here. No mortgage logic in schema.
--
-- RLS mirrors the boards model: org members manage their org's rows directly
-- (direct insert/update works for server actions; auth.uid() is present via
-- the @supabase/ssr server client, same as createBoard).
-- ─────────────────────────────────────────────────────────────────────────

-- ── onboarding_profiles ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.onboarding_profiles (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'in_progress',  -- in_progress | completed
  current_step     TEXT,                                 -- last step key the LO was on
  answers          JSONB NOT NULL DEFAULT '{}'::jsonb,    -- production/goal/workflow answers
  focus_weights    JSONB NOT NULL DEFAULT '{}'::jsonb,    -- weighted focus-area priorities
  personalization  JSONB NOT NULL DEFAULT '{}'::jsonb,    -- derived tailoring summary
  provisioned      BOOLEAN NOT NULL DEFAULT FALSE,        -- workspace generated yet?
  provisioned_at   TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id)
);

CREATE TRIGGER onboarding_profiles_set_updated_at
  BEFORE UPDATE ON public.onboarding_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.onboarding_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_profiles_all ON public.onboarding_profiles FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── setup_checklist_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.setup_checklist_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_key         TEXT NOT NULL,                  -- stable key (e.g. import-clients)
  title            TEXT NOT NULL,
  description      TEXT,
  icon             TEXT,
  action_href      TEXT,                           -- where the LO goes to complete it
  position         INTEGER NOT NULL DEFAULT 0,
  completed        BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at     TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, item_key)
);

CREATE INDEX IF NOT EXISTS setup_checklist_org_idx
  ON public.setup_checklist_items(organization_id, position);

CREATE TRIGGER setup_checklist_items_set_updated_at
  BEFORE UPDATE ON public.setup_checklist_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.setup_checklist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY setup_checklist_items_all ON public.setup_checklist_items FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── integration_preferences ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.integration_preferences (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider         TEXT NOT NULL,                  -- arive | ghl | zapier | los | other
  status           TEXT NOT NULL DEFAULT 'not_started', -- not_started|interested|connect_later|connected
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  note             TEXT,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, provider)
);

CREATE TRIGGER integration_preferences_set_updated_at
  BEFORE UPDATE ON public.integration_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.integration_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY integration_preferences_all ON public.integration_preferences FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── onboarding_uploads (import metadata; mapping engine deferred to Phase 16) ─
CREATE TABLE IF NOT EXISTS public.onboarding_uploads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind             TEXT NOT NULL,                  -- past_clients|call_list|realtors|active_leads|loans
  file_name        TEXT NOT NULL,
  mime_type        TEXT,
  size_bytes       BIGINT,
  row_count        INTEGER,
  status           TEXT NOT NULL DEFAULT 'received', -- received | pending_mapping
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS onboarding_uploads_org_idx
  ON public.onboarding_uploads(organization_id, created_at DESC);

ALTER TABLE public.onboarding_uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY onboarding_uploads_all ON public.onboarding_uploads FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
