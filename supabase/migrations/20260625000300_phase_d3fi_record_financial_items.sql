-- ─────────────────────────────────────────────────────────────────────────
-- Phase D3-FI: record_financial_items — repeatable financial line items.
--
-- Backs the Financial Info tab: a record has many income / asset / liability /
-- REO items, each optionally tied to a borrower. Item fields live in `data`
-- (JSONB by slug). Section totals (monthly income / total assets / monthly
-- liabilities) are recomputed by the app and mirrored into the record's
-- field_values so the Overview + a future DTI can read them. No mortgage logic
-- in the schema.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.record_financial_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id        UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  borrower_id      UUID REFERENCES public.record_borrowers(id) ON DELETE SET NULL,
  category         TEXT NOT NULL,                       -- income | asset | liability | reo
  position         INTEGER NOT NULL DEFAULT 0,
  data             JSONB NOT NULL DEFAULT '{}'::jsonb,  -- item fields by slug
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS record_financial_items_record_idx
  ON public.record_financial_items(record_id, category, position);

CREATE TRIGGER record_financial_items_set_updated_at
  BEFORE UPDATE ON public.record_financial_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.record_financial_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY record_financial_items_select ON public.record_financial_items FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY record_financial_items_insert ON public.record_financial_items FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY record_financial_items_update ON public.record_financial_items FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY record_financial_items_delete ON public.record_financial_items FOR DELETE
  USING (public.is_org_member(organization_id));
