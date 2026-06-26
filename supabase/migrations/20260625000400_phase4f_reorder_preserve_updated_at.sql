-- ─────────────────────────────────────────────────────────────────────────
-- Phase 4F — Kanban reorder must not reset recency.
--
-- Reordering a card within a column writes records.position (the existing sort
-- column). The shared set_updated_at() BEFORE-UPDATE trigger bumps updated_at on
-- every records UPDATE, so a pure reorder made cards look "just touched" — which
-- reset last-activity, attention/stale surfacing, and workflow stale scans.
--
-- Fix (records-scoped, no schema/column change, no RPC): replace ONLY the records
-- updated_at trigger with one that preserves updated_at when `position` is the
-- ONLY column that changed (a reorder). Every other update still bumps it exactly
-- as before. Other tables keep the generic set_updated_at() untouched.
--
-- Whole-row comparison (NEW vs OLD with position/updated_at neutralized) keeps this
-- robust to future column additions: if anything besides position changed, it's a
-- real edit → NOW(). position is only ever written by the reorder path, so a
-- position-only update is unambiguously a reorder.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_records_updated_at()
RETURNS TRIGGER AS $$
DECLARE
  v_probe public.records;
BEGIN
  -- Copy NEW, then neutralize the two fields a reorder is allowed to touch.
  v_probe := NEW;
  v_probe.position   := OLD.position;
  v_probe.updated_at := OLD.updated_at;

  IF v_probe IS NOT DISTINCT FROM OLD THEN
    -- Only `position` changed → a reorder. Preserve recency/staleness.
    NEW.updated_at := OLD.updated_at;
  ELSE
    -- Any other change → behave like the generic trigger.
    NEW.updated_at := NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Re-point ONLY the records trigger; leave every other table on set_updated_at().
DROP TRIGGER IF EXISTS set_records_updated_at ON public.records;
CREATE TRIGGER set_records_updated_at
  BEFORE UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.set_records_updated_at();
