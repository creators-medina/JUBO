-- Phase 6: Widget Engine + Dashboard Builder
-- Tables: dashboards, dashboard_widgets, saved_views
-- RLS: org-isolated, authenticated only
-- Note: set_updated_at() trigger function already exists from initial_schema migration

-- ============================================================
-- DASHBOARDS
-- ============================================================
CREATE TABLE public.dashboards (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  slug             TEXT        NOT NULL,
  description      TEXT,
  icon             TEXT,
  color            TEXT,
  is_default       BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE TRIGGER dashboards_updated_at
  BEFORE UPDATE ON public.dashboards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- DASHBOARD WIDGETS
-- ============================================================
CREATE TABLE public.dashboard_widgets (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  dashboard_id  UUID        NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  widget_type   TEXT        NOT NULL CHECK (widget_type IN ('metric', 'list', 'board_summary')),
  title         TEXT        NOT NULL,
  position_x    INTEGER     NOT NULL DEFAULT 0,
  position_y    INTEGER     NOT NULL DEFAULT 0,
  width         INTEGER     NOT NULL DEFAULT 2 CHECK (width BETWEEN 1 AND 4),
  height        INTEGER     NOT NULL DEFAULT 1,
  config        JSONB       NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER dashboard_widgets_updated_at
  BEFORE UPDATE ON public.dashboard_widgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- SAVED VIEWS
-- ============================================================
CREATE TABLE public.saved_views (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board_id         UUID        REFERENCES public.boards(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  filters          JSONB       NOT NULL DEFAULT '[]',
  sort             JSONB       NOT NULL DEFAULT '{}',
  visible_fields   JSONB       NOT NULL DEFAULT '[]',
  created_by       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_dashboards_org         ON public.dashboards(organization_id);
CREATE INDEX idx_dashboards_default     ON public.dashboards(organization_id, is_default) WHERE is_default = TRUE;
CREATE INDEX idx_dashboard_widgets_dash ON public.dashboard_widgets(dashboard_id);
CREATE INDEX idx_saved_views_org        ON public.saved_views(organization_id);
CREATE INDEX idx_saved_views_board      ON public.saved_views(board_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.dashboards        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_views       ENABLE ROW LEVEL SECURITY;

-- dashboards: any org member can read/write; only admins can delete
CREATE POLICY "dashboards_select" ON public.dashboards
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "dashboards_insert" ON public.dashboards
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "dashboards_update" ON public.dashboards
  FOR UPDATE USING (public.is_org_member(organization_id));

CREATE POLICY "dashboards_delete" ON public.dashboards
  FOR DELETE USING (public.is_org_admin(organization_id));

-- dashboard_widgets: scoped through parent dashboard → org
CREATE POLICY "dashboard_widgets_select" ON public.dashboard_widgets
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id AND public.is_org_member(d.organization_id)
    )
  );

CREATE POLICY "dashboard_widgets_insert" ON public.dashboard_widgets
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id AND public.is_org_member(d.organization_id)
    )
  );

CREATE POLICY "dashboard_widgets_update" ON public.dashboard_widgets
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id AND public.is_org_member(d.organization_id)
    )
  );

CREATE POLICY "dashboard_widgets_delete" ON public.dashboard_widgets
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.dashboards d
      WHERE d.id = dashboard_id AND public.is_org_member(d.organization_id)
    )
  );

-- saved_views: org-member scoped
CREATE POLICY "saved_views_select" ON public.saved_views
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY "saved_views_insert" ON public.saved_views
  FOR INSERT WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY "saved_views_update" ON public.saved_views
  FOR UPDATE USING (public.is_org_member(organization_id));

CREATE POLICY "saved_views_delete" ON public.saved_views
  FOR DELETE USING (public.is_org_member(organization_id));
