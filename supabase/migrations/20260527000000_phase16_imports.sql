-- ─────────────────────────────────────────────────────────────────────────
-- Phase 16: Import Mapping Engine — audit / ingestion tracking
--
--   imports      — one row per import run (header + execution summary)
--   import_rows  — per-row outcome (imported | skipped | failed | duplicate)
--
-- The actual record/field-value writes go through the existing record + field
-- engines (batched direct inserts, same RLS as createRecord). These tables only
-- record what happened, for audit + retry. No mortgage logic in the schema.
-- ─────────────────────────────────────────────────────────────────────────

-- ── imports (audit header) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.imports (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  uploaded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  board_id         UUID REFERENCES public.boards(id) ON DELETE SET NULL,
  group_id         UUID REFERENCES public.board_groups(id) ON DELETE SET NULL,
  source_type      TEXT NOT NULL DEFAULT 'csv',     -- csv | xlsx | monday
  template_key     TEXT,                            -- starter template used, if any
  file_name        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending', -- pending | running | completed | partial | failed
  row_count        INTEGER NOT NULL DEFAULT 0,
  imported_count   INTEGER NOT NULL DEFAULT 0,
  skipped_count    INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  duplicate_count  INTEGER NOT NULL DEFAULT 0,
  mapping          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- column → field mapping config
  summary          JSONB NOT NULL DEFAULT '{}'::jsonb,   -- execution summary / suggestions
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS imports_org_idx ON public.imports(organization_id, created_at DESC);

ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY imports_all ON public.imports FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── import_rows (per-row outcome) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.import_rows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id        UUID NOT NULL REFERENCES public.imports(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  row_index        INTEGER NOT NULL,
  status           TEXT NOT NULL DEFAULT 'imported', -- imported | skipped | failed | duplicate
  record_id        UUID REFERENCES public.records(id) ON DELETE SET NULL,
  matched_record_id UUID REFERENCES public.records(id) ON DELETE SET NULL, -- dedupe match
  source_data      JSONB NOT NULL DEFAULT '{}'::jsonb,
  error            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS import_rows_import_idx ON public.import_rows(import_id, row_index);
CREATE INDEX IF NOT EXISTS import_rows_status_idx ON public.import_rows(import_id, status);

ALTER TABLE public.import_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY import_rows_all ON public.import_rows FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
