-- ─────────────────────────────────────────────────────────────────────────
-- Phase 8: Goal Engine + Funnel Infrastructure
--
-- Tables:
--   funnels                 — configurable funnel definitions (e.g. "Mortgage Funnel")
--   funnel_stages           — ordered steps in a funnel (e.g. "Leads", "Closings")
--   conversion_assumptions  — editable rate from one stage to another
--   production_goals        — top-level business goals (units / volume / revenue)
--   goal_targets            — derived daily/weekly/monthly/yearly stage targets
--
-- All tables org-scoped via RLS. INSERTs use SECURITY DEFINER RPCs because
-- auth.uid() returns NULL inside RLS WITH CHECK during server actions.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Funnels ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funnels (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  description     TEXT,
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS funnels_org_idx ON public.funnels(organization_id);

ALTER TABLE public.funnels ENABLE ROW LEVEL SECURITY;

CREATE POLICY funnels_select ON public.funnels FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY funnels_update ON public.funnels FOR UPDATE
  USING (public.is_org_member(organization_id));
CREATE POLICY funnels_delete ON public.funnels FOR DELETE
  USING (public.is_org_admin(organization_id));

-- ── 2. Funnel Stages ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.funnel_stages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id       UUID NOT NULL REFERENCES public.funnels(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  stage_order     INTEGER NOT NULL,
  stage_type      TEXT NOT NULL DEFAULT 'activity',   -- free-form; e.g. activity|qualification|outcome
  board_group_id  UUID REFERENCES public.board_groups(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (funnel_id, slug),
  UNIQUE (funnel_id, stage_order)
);

CREATE INDEX IF NOT EXISTS funnel_stages_funnel_idx ON public.funnel_stages(funnel_id);
CREATE INDEX IF NOT EXISTS funnel_stages_board_group_idx ON public.funnel_stages(board_group_id);

ALTER TABLE public.funnel_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY funnel_stages_select ON public.funnel_stages FOR SELECT
  USING (funnel_id IN (SELECT id FROM public.funnels WHERE public.is_org_member(organization_id)));
CREATE POLICY funnel_stages_update ON public.funnel_stages FOR UPDATE
  USING (funnel_id IN (SELECT id FROM public.funnels WHERE public.is_org_member(organization_id)));
CREATE POLICY funnel_stages_delete ON public.funnel_stages FOR DELETE
  USING (funnel_id IN (SELECT id FROM public.funnels WHERE public.is_org_member(organization_id)));

-- ── 3. Conversion Assumptions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversion_assumptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  funnel_stage_id  UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  target_stage_id  UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  conversion_rate  NUMERIC(6,5) NOT NULL CHECK (conversion_rate >= 0 AND conversion_rate <= 1),
  timeframe        TEXT NOT NULL DEFAULT 'monthly',
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, funnel_stage_id, target_stage_id)
);

CREATE INDEX IF NOT EXISTS conversion_assumptions_org_idx ON public.conversion_assumptions(organization_id);
CREATE INDEX IF NOT EXISTS conversion_assumptions_pair_idx ON public.conversion_assumptions(funnel_stage_id, target_stage_id);

ALTER TABLE public.conversion_assumptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY conversion_assumptions_select ON public.conversion_assumptions FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY conversion_assumptions_update ON public.conversion_assumptions FOR UPDATE
  USING (public.is_org_member(organization_id));
CREATE POLICY conversion_assumptions_delete ON public.conversion_assumptions FOR DELETE
  USING (public.is_org_member(organization_id));

-- ── 4. Production Goals ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.production_goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  funnel_id       UUID REFERENCES public.funnels(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  timeframe       TEXT NOT NULL DEFAULT 'yearly',
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  target_units    NUMERIC(14,2),
  target_volume   NUMERIC(14,2),
  target_revenue  NUMERIC(14,2),
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS production_goals_org_idx ON public.production_goals(organization_id);
CREATE INDEX IF NOT EXISTS production_goals_funnel_idx ON public.production_goals(funnel_id);

ALTER TABLE public.production_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY production_goals_select ON public.production_goals FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY production_goals_update ON public.production_goals FOR UPDATE
  USING (public.is_org_member(organization_id));
CREATE POLICY production_goals_delete ON public.production_goals FOR DELETE
  USING (public.is_org_member(organization_id));

-- ── 5. Goal Targets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.goal_targets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_goal_id UUID NOT NULL REFERENCES public.production_goals(id) ON DELETE CASCADE,
  funnel_stage_id    UUID NOT NULL REFERENCES public.funnel_stages(id) ON DELETE CASCADE,
  daily_target       NUMERIC(14,4),
  weekly_target      NUMERIC(14,4),
  monthly_target     NUMERIC(14,4),
  yearly_target      NUMERIC(14,4),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (production_goal_id, funnel_stage_id)
);

CREATE INDEX IF NOT EXISTS goal_targets_goal_idx ON public.goal_targets(production_goal_id);

ALTER TABLE public.goal_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_targets_select ON public.goal_targets FOR SELECT
  USING (production_goal_id IN (SELECT id FROM public.production_goals WHERE public.is_org_member(organization_id)));
CREATE POLICY goal_targets_update ON public.goal_targets FOR UPDATE
  USING (production_goal_id IN (SELECT id FROM public.production_goals WHERE public.is_org_member(organization_id)));
CREATE POLICY goal_targets_delete ON public.goal_targets FOR DELETE
  USING (production_goal_id IN (SELECT id FROM public.production_goals WHERE public.is_org_member(organization_id)));

-- ── 6. Expand dashboard_widgets.widget_type CHECK constraint ───────────────
ALTER TABLE public.dashboard_widgets
  DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets
  ADD CONSTRAINT dashboard_widgets_widget_type_check
  CHECK (widget_type IN (
    'metric', 'list', 'board_summary', 'activity_feed', 'saved_view',
    'goal_progress', 'funnel_pace', 'gap_analysis'
  ));

-- ── 7. updated_at triggers ──────────────────────────────────────────────────
CREATE TRIGGER funnels_set_updated_at
  BEFORE UPDATE ON public.funnels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER conversion_assumptions_set_updated_at
  BEFORE UPDATE ON public.conversion_assumptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER production_goals_set_updated_at
  BEFORE UPDATE ON public.production_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 8. RPC: create_funnel ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_funnel(
  p_organization_id UUID,
  p_name            TEXT,
  p_description     TEXT
) RETURNS UUID AS $$
DECLARE
  v_funnel_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.funnels (organization_id, name, description, created_by)
  VALUES (p_organization_id, p_name, p_description, auth.uid())
  RETURNING id INTO v_funnel_id;

  RETURN v_funnel_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_funnel(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_funnel(UUID, TEXT, TEXT) TO authenticated;

-- ── 9. RPC: create_funnel_stage ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_funnel_stage(
  p_funnel_id      UUID,
  p_name           TEXT,
  p_slug           TEXT,
  p_stage_order    INTEGER,
  p_stage_type     TEXT,
  p_board_group_id UUID
) RETURNS UUID AS $$
DECLARE
  v_org_id   UUID;
  v_stage_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.funnels WHERE id = p_funnel_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Funnel not found'; END IF;
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.funnel_stages (funnel_id, name, slug, stage_order, stage_type, board_group_id)
  VALUES (p_funnel_id, p_name, p_slug, p_stage_order, COALESCE(p_stage_type, 'activity'), p_board_group_id)
  RETURNING id INTO v_stage_id;

  RETURN v_stage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_funnel_stage(UUID, TEXT, TEXT, INTEGER, TEXT, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_funnel_stage(UUID, TEXT, TEXT, INTEGER, TEXT, UUID) TO authenticated;

-- ── 10. RPC: upsert_conversion_assumption ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_conversion_assumption(
  p_organization_id UUID,
  p_funnel_stage_id UUID,
  p_target_stage_id UUID,
  p_conversion_rate NUMERIC,
  p_timeframe       TEXT,
  p_notes           TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.conversion_assumptions
    (organization_id, funnel_stage_id, target_stage_id, conversion_rate, timeframe, notes)
  VALUES
    (p_organization_id, p_funnel_stage_id, p_target_stage_id, p_conversion_rate,
     COALESCE(p_timeframe, 'monthly'), p_notes)
  ON CONFLICT (organization_id, funnel_stage_id, target_stage_id)
  DO UPDATE SET
    conversion_rate = EXCLUDED.conversion_rate,
    timeframe       = EXCLUDED.timeframe,
    notes           = EXCLUDED.notes,
    updated_at      = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.upsert_conversion_assumption(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_conversion_assumption(UUID, UUID, UUID, NUMERIC, TEXT, TEXT) TO authenticated;

-- ── 11. RPC: create_production_goal ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_production_goal(
  p_organization_id UUID,
  p_funnel_id       UUID,
  p_name            TEXT,
  p_timeframe       TEXT,
  p_start_date      DATE,
  p_end_date        DATE,
  p_target_units    NUMERIC,
  p_target_volume   NUMERIC,
  p_target_revenue  NUMERIC
) RETURNS UUID AS $$
DECLARE
  v_goal_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.production_goals (
    organization_id, funnel_id, name, timeframe, start_date, end_date,
    target_units, target_volume, target_revenue, created_by
  )
  VALUES (
    p_organization_id, p_funnel_id, p_name, COALESCE(p_timeframe, 'yearly'),
    p_start_date, p_end_date,
    p_target_units, p_target_volume, p_target_revenue, auth.uid()
  )
  RETURNING id INTO v_goal_id;

  RETURN v_goal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_production_goal(UUID, UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_production_goal(UUID, UUID, TEXT, TEXT, DATE, DATE, NUMERIC, NUMERIC, NUMERIC) TO authenticated;

-- ── 12. RPC: set_goal_targets (batch upsert) ────────────────────────────────
-- p_targets is a JSONB array of:
--   { funnel_stage_id, daily_target, weekly_target, monthly_target, yearly_target }
CREATE OR REPLACE FUNCTION public.set_goal_targets(
  p_production_goal_id UUID,
  p_targets            JSONB
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  t        JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.production_goals WHERE id = p_production_goal_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Production goal not found'; END IF;
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  DELETE FROM public.goal_targets WHERE production_goal_id = p_production_goal_id;

  FOR t IN SELECT * FROM jsonb_array_elements(COALESCE(p_targets, '[]'::jsonb))
  LOOP
    INSERT INTO public.goal_targets
      (production_goal_id, funnel_stage_id, daily_target, weekly_target, monthly_target, yearly_target)
    VALUES (
      p_production_goal_id,
      (t->>'funnel_stage_id')::UUID,
      NULLIF(t->>'daily_target',   '')::NUMERIC,
      NULLIF(t->>'weekly_target',  '')::NUMERIC,
      NULLIF(t->>'monthly_target', '')::NUMERIC,
      NULLIF(t->>'yearly_target',  '')::NUMERIC
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.set_goal_targets(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_goal_targets(UUID, JSONB) TO authenticated;
