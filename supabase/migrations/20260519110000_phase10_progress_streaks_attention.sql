-- ─────────────────────────────────────────────────────────────────────────
-- Phase 10: Progress History + Streaks + Attention Views
--
-- Changes:
--   * saved_views gains attention-view columns (toggle to surface on /today)
--   * RPC: update_saved_view_attention — set the attention toggle/metadata
--   * RPC: bulk_complete_daily_actions — multi-action completion in one call
--   * RPC: snooze_daily_action — single-action reschedule with audit metadata
--
-- daily_progress already exists from Phase 9. This phase starts writing to it.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. saved_views attention columns ───────────────────────────────────────
ALTER TABLE public.saved_views
  ADD COLUMN IF NOT EXISTS is_attention_view  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attention_priority TEXT,
  ADD COLUMN IF NOT EXISTS attention_label    TEXT,
  ADD COLUMN IF NOT EXISTS attention_color    TEXT,
  ADD COLUMN IF NOT EXISTS show_on_today      BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS saved_views_attention_idx
  ON public.saved_views(organization_id, show_on_today)
  WHERE is_attention_view = TRUE AND show_on_today = TRUE;

-- ── 2. RPC: update_saved_view_attention ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_saved_view_attention(
  p_saved_view_id      UUID,
  p_is_attention_view  BOOLEAN,
  p_attention_priority TEXT,
  p_attention_label    TEXT,
  p_attention_color    TEXT,
  p_show_on_today      BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.saved_views WHERE id = p_saved_view_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Saved view not found'; END IF;
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  UPDATE public.saved_views
  SET is_attention_view  = COALESCE(p_is_attention_view, is_attention_view),
      attention_priority = p_attention_priority,
      attention_label    = p_attention_label,
      attention_color    = p_attention_color,
      show_on_today      = COALESCE(p_show_on_today, show_on_today)
  WHERE id = p_saved_view_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.update_saved_view_attention(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_saved_view_attention(UUID, BOOLEAN, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- ── 3. RPC: bulk_complete_daily_actions ────────────────────────────────────
-- Marks multiple daily_actions as complete (or reopens them when p_complete = FALSE).
-- Each row must belong to the caller; rows for other users are silently skipped.
CREATE OR REPLACE FUNCTION public.bulk_complete_daily_actions(
  p_ids       UUID[],
  p_complete  BOOLEAN
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
  v_ts    TIMESTAMPTZ;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  v_ts := CASE WHEN COALESCE(p_complete, TRUE) THEN NOW() ELSE NULL END;

  UPDATE public.daily_actions
  SET completed_at = v_ts
  WHERE id = ANY(p_ids) AND user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Mirror to linked tasks
  UPDATE public.tasks t
  SET completed_at = v_ts
  WHERE t.id IN (
    SELECT task_id FROM public.daily_actions
    WHERE id = ANY(p_ids) AND user_id = auth.uid() AND task_id IS NOT NULL
  );

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.bulk_complete_daily_actions(UUID[], BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_complete_daily_actions(UUID[], BOOLEAN) TO authenticated;

-- ── 4. RPC: snooze_daily_action ────────────────────────────────────────────
-- Reschedules an action to a new due_date. Preserves source metadata.
CREATE OR REPLACE FUNCTION public.snooze_daily_action(
  p_id        UUID,
  p_due_date  DATE
) RETURNS VOID AS $$
DECLARE
  v_existing public.daily_actions%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_existing FROM public.daily_actions
  WHERE id = p_id AND user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'Action not found'; END IF;

  UPDATE public.daily_actions
  SET due_date = p_due_date,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'snoozed_from', v_existing.due_date::text,
        'snoozed_at',   NOW()::text
      )
  WHERE id = p_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.snooze_daily_action(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.snooze_daily_action(UUID, DATE) TO authenticated;

-- ── 5. RPC: bulk_snooze_daily_actions ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.bulk_snooze_daily_actions(
  p_ids       UUID[],
  p_due_date  DATE
) RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.daily_actions
  SET due_date = p_due_date,
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'snoozed_from', due_date::text,
        'snoozed_at',   NOW()::text,
        'bulk_snoozed', TRUE
      )
  WHERE id = ANY(p_ids) AND user_id = auth.uid();
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.bulk_snooze_daily_actions(UUID[], DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bulk_snooze_daily_actions(UUID[], DATE) TO authenticated;
