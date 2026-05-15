-- Phase 7: Dashboard Management + Widget Polish
-- Changes:
--   1. Add is_archived to dashboards
--   2. Expand widget_type CHECK for activity_feed + saved_view
--   3. RPC: archive_dashboard (soft-delete with last-dashboard guard)
--   4. RPC: add_dashboard_widget (SECURITY DEFINER insert)
--   5. RPC: reorder_dashboard_widgets (atomic multi-row position update)
--   6. RPC: create_saved_view (SECURITY DEFINER insert)

-- ────────────────────────────────────────────────────────────
-- 1. Archive column on dashboards
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.dashboards
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_dashboards_active
  ON public.dashboards(organization_id, is_archived)
  WHERE is_archived = FALSE;

-- ────────────────────────────────────────────────────────────
-- 2. Expand widget_type CHECK constraint
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.dashboard_widgets
  DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets
  ADD CONSTRAINT dashboard_widgets_widget_type_check
  CHECK (widget_type IN ('metric', 'list', 'board_summary', 'activity_feed', 'saved_view'));

-- ────────────────────────────────────────────────────────────
-- 3. RPC: archive_dashboard
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_dashboard(p_dashboard_id UUID)
RETURNS VOID AS $$
DECLARE
  v_user_id    UUID;
  v_org_id     UUID;
  v_remaining  INTEGER;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.dashboards
  WHERE id = p_dashboard_id AND is_archived = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard not found';
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  -- Guard: cannot archive the last active dashboard
  SELECT COUNT(*) INTO v_remaining
  FROM public.dashboards
  WHERE organization_id = v_org_id
    AND is_archived = FALSE
    AND id <> p_dashboard_id;

  IF v_remaining = 0 THEN
    RAISE EXCEPTION 'Cannot archive the last dashboard';
  END IF;

  UPDATE public.dashboards
  SET is_archived = TRUE, updated_at = NOW()
  WHERE id = p_dashboard_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.archive_dashboard(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.archive_dashboard(UUID) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 4. RPC: add_dashboard_widget
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_dashboard_widget(
  p_dashboard_id UUID,
  p_widget_type  TEXT,
  p_title        TEXT,
  p_width        INTEGER DEFAULT 2,
  p_height       INTEGER DEFAULT 1,
  p_config       JSONB   DEFAULT '{}'
)
RETURNS UUID AS $$
DECLARE
  v_user_id   UUID;
  v_org_id    UUID;
  v_next_pos  INTEGER;
  v_widget_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.dashboards
  WHERE id = p_dashboard_id AND is_archived = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dashboard not found';
  END IF;

  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  SELECT COALESCE(MAX(position_y) + 1, 0) INTO v_next_pos
  FROM public.dashboard_widgets
  WHERE dashboard_id = p_dashboard_id;

  INSERT INTO public.dashboard_widgets
    (dashboard_id, widget_type, title, width, height, position_y, config)
  VALUES
    (p_dashboard_id, p_widget_type, p_title, p_width, p_height, v_next_pos, p_config)
  RETURNING id INTO v_widget_id;

  RETURN v_widget_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.add_dashboard_widget(UUID, TEXT, TEXT, INTEGER, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_dashboard_widget(UUID, TEXT, TEXT, INTEGER, INTEGER, JSONB) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 5. RPC: reorder_dashboard_widgets
--    Input: JSONB array of {id: uuid, position_y: int}
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reorder_dashboard_widgets(
  p_positions JSONB
)
RETURNS VOID AS $$
DECLARE
  item     JSONB;
  v_org_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(p_positions)
  LOOP
    -- Only update if the widget belongs to a dashboard the caller is a member of
    UPDATE public.dashboard_widgets w
    SET    position_y  = (item->>'position_y')::INTEGER,
           updated_at  = NOW()
    FROM   public.dashboards d
    WHERE  w.id           = (item->>'id')::UUID
      AND  w.dashboard_id = d.id
      AND  public.is_org_member(d.organization_id);
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.reorder_dashboard_widgets(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reorder_dashboard_widgets(JSONB) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 6. RPC: create_saved_view
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_saved_view(
  p_organization_id UUID,
  p_board_id        UUID,
  p_name            TEXT,
  p_filters         JSONB DEFAULT '[]',
  p_sort            JSONB DEFAULT '{}',
  p_visible_fields  JSONB DEFAULT '[]'
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_view_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.saved_views
    (organization_id, board_id, name, filters, sort, visible_fields, created_by)
  VALUES
    (p_organization_id, p_board_id, p_name, p_filters, p_sort, p_visible_fields, v_user_id)
  RETURNING id INTO v_view_id;

  RETURN v_view_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_saved_view(UUID, UUID, TEXT, JSONB, JSONB, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_saved_view(UUID, UUID, TEXT, JSONB, JSONB, JSONB) TO authenticated;
