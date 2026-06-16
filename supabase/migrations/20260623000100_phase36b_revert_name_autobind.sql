-- ─────────────────────────────────────────────────────────────────────────
-- Phase 36B correction — disable auto-binding of the `name` common key.
--
-- The record/item title is the source of truth for a person's Name, so no field
-- should be auto-bound to the `name` key. The allowlist (backfill + import) has
-- been corrected to exclude name/full_name/borrower_name. This migration reverts
-- any field that the original backfill/import already auto-bound to `name`.
--
-- Manual assignments (made via the column menu) write NO audit row, so they are
-- preserved — we only revert fields that have an audit row with matched_key =
-- 'name'. The `name` key stays seeded and remains manually assignable.
--
-- Idempotent: once reverted, those fields no longer point at a `name` key, so a
-- re-run matches nothing. field_values and the record/title column are untouched.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r       RECORD;
  v_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT f.id, f.organization_id, f.board_id, f.name, f.field_type
    FROM public.fields f
    WHERE f.common_field_key_id IN (SELECT id FROM public.common_field_keys WHERE key = 'name')
      AND EXISTS (
        SELECT 1 FROM public.common_field_backfill_audit a
        WHERE a.field_id = f.id AND a.matched_key = 'name'
      )
  LOOP
    UPDATE public.fields SET common_field_key_id = NULL WHERE id = r.id;

    INSERT INTO public.common_field_backfill_audit
      (field_id, organization_id, board_id, field_name, field_type, matched_key, reason, source)
    VALUES
      (r.id, r.organization_id, r.board_id, r.name, r.field_type::text, NULL, 'reverted: name auto-bind disabled', 'backfill')
    ON CONFLICT (field_id, source)
      DO UPDATE SET matched_key = NULL, reason = 'reverted: name auto-bind disabled', created_at = NOW();

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'phase36b revert: unbound % field(s) from the name key', v_count;
END $$;
