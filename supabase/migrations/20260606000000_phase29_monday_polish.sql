-- ─────────────────────────────────────────────────────────────────────────
-- Phase 29 — Monday-style board polish.
--
-- Adds subitems via records.parent_record_id (additive, nullable). The status
-- / dropdown column types live entirely in fields.config.options JSONB — no
-- schema change there. Bulk operations reuse the existing move_record RPC,
-- so there is no new audit table.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS parent_record_id UUID NULL
    REFERENCES public.records(id) ON DELETE CASCADE;

-- Partial index so subitem lookups stay fast without bloating the unrelated index.
CREATE INDEX IF NOT EXISTS idx_records_parent
  ON public.records(parent_record_id)
  WHERE parent_record_id IS NOT NULL;
