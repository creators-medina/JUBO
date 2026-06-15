-- ─────────────────────────────────────────────────────────────────────────
-- Phase 35E — Checklist engine (group requirements).
--
-- A checklist is NOT a separate system. It is derived from the fields that
-- belong to a group: a field can be marked REQUIRED for a group, and a record's
-- checklist is "fill in every required (and group-visible) field."
--
-- Mirrors field_group_visibility (Phase 35B). A field with no row here is not
-- required. Existing boards have zero rows → no checklists → no behavior change.
-- Requirements never touch field_values; completion is computed on read.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.field_requirements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_id        UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES public.board_groups(id) ON DELETE CASCADE,
  is_required     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(field_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_freq_field ON public.field_requirements(field_id);
CREATE INDEX IF NOT EXISTS idx_freq_group ON public.field_requirements(group_id);
CREATE INDEX IF NOT EXISTS idx_freq_org   ON public.field_requirements(organization_id);

ALTER TABLE public.field_requirements ENABLE ROW LEVEL SECURITY;

-- Same shape as fields/boards: any member of the row's org may read/write.
CREATE POLICY "freq_all_org_members" ON public.field_requirements
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
