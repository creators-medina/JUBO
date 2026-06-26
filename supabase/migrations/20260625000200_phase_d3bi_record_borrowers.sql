-- ─────────────────────────────────────────────────────────────────────────
-- Phase D3-BI: record_borrowers — one row per borrower per record.
--
-- Backs the Borrower Info tab. A loan record can have a primary borrower plus
-- co-borrowers; each is a row here. Borrower fields are stored in `data` (JSONB,
-- keyed by the borrower schema slugs) so the form can evolve without migrations.
-- The primary borrower's email/cell_phone are mirrored into the record's
-- phone/email field_values by the app so the header Call/Email + SMS composer
-- keep working. No mortgage logic in the schema.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.record_borrowers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id        UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  position         INTEGER NOT NULL DEFAULT 0,          -- 0 = primary
  is_primary       BOOLEAN NOT NULL DEFAULT FALSE,
  data             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- borrower fields by slug
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS record_borrowers_record_idx
  ON public.record_borrowers(record_id, position);

CREATE TRIGGER record_borrowers_set_updated_at
  BEFORE UPDATE ON public.record_borrowers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.record_borrowers ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_borrowers_select ON public.record_borrowers FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY record_borrowers_insert ON public.record_borrowers FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY record_borrowers_update ON public.record_borrowers FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY record_borrowers_delete ON public.record_borrowers FOR DELETE
  USING (public.is_org_member(organization_id));
