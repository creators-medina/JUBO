-- ─────────────────────────────────────────────────────────────────────────
-- Phase 35B — Field visibility layer.
--
-- Fields still belong to boards (unchanged). This adds an OPT-IN visibility
-- layer on top:
--   * A field with NO rows here  → common: visible in every group.
--   * A field with ≥1 row here   → group-specific: visible ONLY in those groups.
--
-- Existing boards have zero rows, so every field stays common = today's exact
-- behavior. Nothing about fields / field_values / records changes. Hiding a
-- field is purely presentational — field_values are preserved untouched.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.field_group_visibility (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  field_id        UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES public.board_groups(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(field_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_fgv_field ON public.field_group_visibility(field_id);
CREATE INDEX IF NOT EXISTS idx_fgv_group ON public.field_group_visibility(group_id);
CREATE INDEX IF NOT EXISTS idx_fgv_org   ON public.field_group_visibility(organization_id);

ALTER TABLE public.field_group_visibility ENABLE ROW LEVEL SECURITY;

-- Same shape as fields/boards: any member of the row's org may read/write.
CREATE POLICY "fgv_all_org_members" ON public.field_group_visibility
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
