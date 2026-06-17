-- ─────────────────────────────────────────────────────────────────────────
-- Phase 38C — Blueprint apply (create-only, idempotent, recoverable).
--
-- Stores the validated preview plan keyed by apply_token. Apply executes the
-- STORED plan (never raw JSON), claims the token atomically (status guard) to
-- prevent concurrent double-apply, records created board ids as it goes (for
-- on-failure cleanup), and is idempotent (a succeeded token returns its result
-- and creates nothing). Structure creation itself stays in the TS helpers.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.blueprint_applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  apply_token        TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'draft',
  plan               JSONB NOT NULL,
  result             JSONB,
  created_board_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
  error              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ,
  applied_at         TIMESTAMPTZ,
  CONSTRAINT bp_status_chk CHECK (status IN ('draft', 'applying', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_bp_apps_org ON public.blueprint_applications(organization_id);

ALTER TABLE public.blueprint_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bp_apps_all_org_members" ON public.blueprint_applications
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
