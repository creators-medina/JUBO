-- ─────────────────────────────────────────────────────────────────────────
-- Phase 9: Win the Day — Daily Action Cockpit
--
-- Tables:
--   daily_actions   — the generated/manual action list (per user, per day)
--   daily_progress  — cached metric snapshots (per user, per goal, per day)
--
-- Generated actions are idempotent via partial UNIQUE indexes:
--   * one row per (user, due_date, task_id) when sourced from a task
--   * one row per (user, due_date, production_goal_id) when sourced from goal_pacing
--
-- Manual actions have no UNIQUE constraint and can be created freely.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Expand task_priority enum to include 'urgent' ──────────────────────────
-- daily_actions reuses task_priority; "urgent" lives in record_priority today
-- but is semantically a daily/task concern too. ALTER TYPE ... ADD VALUE
-- requires IF NOT EXISTS for idempotency across re-runs.
ALTER TYPE public.task_priority ADD VALUE IF NOT EXISTS 'urgent';

-- ── daily_actions ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_actions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  production_goal_id  UUID REFERENCES public.production_goals(id) ON DELETE SET NULL,
  record_id           UUID REFERENCES public.records(id) ON DELETE SET NULL,
  task_id             UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  action_type         TEXT NOT NULL DEFAULT 'general',
  title               TEXT NOT NULL,
  description         TEXT,
  priority            public.task_priority NOT NULL DEFAULT 'medium',
  due_date            DATE NOT NULL,
  completed_at        TIMESTAMPTZ,
  source              TEXT NOT NULL DEFAULT 'manual',  -- 'task' | 'goal_pacing' | 'manual' | 'saved_view' | 'record'
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS daily_actions_user_date_idx ON public.daily_actions(user_id, due_date);
CREATE INDEX IF NOT EXISTS daily_actions_org_date_idx  ON public.daily_actions(organization_id, due_date);
CREATE INDEX IF NOT EXISTS daily_actions_open_idx      ON public.daily_actions(user_id, due_date) WHERE completed_at IS NULL;

-- Idempotency: at most one task-derived action per (user, day, task)
CREATE UNIQUE INDEX IF NOT EXISTS daily_actions_user_day_task_uq
  ON public.daily_actions(user_id, due_date, task_id)
  WHERE task_id IS NOT NULL;

-- At most one goal-pacing action per (user, day, goal)
CREATE UNIQUE INDEX IF NOT EXISTS daily_actions_user_day_goal_uq
  ON public.daily_actions(user_id, due_date, production_goal_id)
  WHERE production_goal_id IS NOT NULL AND source = 'goal_pacing';

CREATE TRIGGER daily_actions_set_updated_at
  BEFORE UPDATE ON public.daily_actions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.daily_actions ENABLE ROW LEVEL SECURITY;

-- Users see/edit only their own actions (within their org)
CREATE POLICY daily_actions_select ON public.daily_actions FOR SELECT
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY daily_actions_update ON public.daily_actions FOR UPDATE
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY daily_actions_delete ON public.daily_actions FOR DELETE
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

-- ── daily_progress ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.daily_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  production_goal_id  UUID REFERENCES public.production_goals(id) ON DELETE CASCADE,
  date                DATE NOT NULL,
  metric_key          TEXT NOT NULL,                              -- 'units' | 'volume' | 'revenue' | stage slug | 'actions_completed'
  target_value        NUMERIC(14,4),
  actual_value        NUMERIC(14,4) NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'on_pace',            -- 'on_pace' | 'ahead' | 'behind' | 'unknown'
  metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date, production_goal_id, metric_key)
);

CREATE INDEX IF NOT EXISTS daily_progress_user_date_idx ON public.daily_progress(user_id, date);
CREATE INDEX IF NOT EXISTS daily_progress_org_idx       ON public.daily_progress(organization_id);

CREATE TRIGGER daily_progress_set_updated_at
  BEFORE UPDATE ON public.daily_progress
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.daily_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_progress_select ON public.daily_progress FOR SELECT
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY daily_progress_update ON public.daily_progress FOR UPDATE
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY daily_progress_delete ON public.daily_progress FOR DELETE
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

-- ── Expand dashboard_widgets.widget_type CHECK ─────────────────────────────
ALTER TABLE public.dashboard_widgets
  DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets
  ADD CONSTRAINT dashboard_widgets_widget_type_check
  CHECK (widget_type IN (
    'metric', 'list', 'board_summary', 'activity_feed', 'saved_view',
    'goal_progress', 'funnel_pace', 'gap_analysis',
    'today_summary', 'daily_actions_list'
  ));

-- ── RPC: create_daily_action (manual creation; sec definer pattern) ────────
CREATE OR REPLACE FUNCTION public.create_daily_action(
  p_organization_id    UUID,
  p_title              TEXT,
  p_description        TEXT,
  p_priority           public.task_priority,
  p_due_date           DATE,
  p_action_type        TEXT,
  p_source             TEXT,
  p_production_goal_id UUID,
  p_record_id          UUID,
  p_task_id            UUID
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.daily_actions (
    organization_id, user_id, production_goal_id, record_id, task_id,
    action_type, title, description, priority, due_date, source
  )
  VALUES (
    p_organization_id, auth.uid(), p_production_goal_id, p_record_id, p_task_id,
    COALESCE(p_action_type, 'general'), p_title, p_description,
    COALESCE(p_priority, 'medium'), COALESCE(p_due_date, CURRENT_DATE),
    COALESCE(p_source, 'manual')
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_daily_action(UUID, TEXT, TEXT, public.task_priority, DATE, TEXT, TEXT, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_daily_action(UUID, TEXT, TEXT, public.task_priority, DATE, TEXT, TEXT, UUID, UUID, UUID) TO authenticated;

-- ── RPC: upsert_generated_daily_action ─────────────────────────────────────
-- Idempotent insert for engine-generated actions. Uses ON CONFLICT against the
-- partial UNIQUE indexes (task or goal_pacing). For other sources just inserts.
CREATE OR REPLACE FUNCTION public.upsert_generated_daily_action(
  p_organization_id    UUID,
  p_user_id            UUID,
  p_title              TEXT,
  p_description        TEXT,
  p_priority           public.task_priority,
  p_due_date           DATE,
  p_action_type        TEXT,
  p_source             TEXT,
  p_production_goal_id UUID,
  p_record_id          UUID,
  p_task_id            UUID,
  p_metadata           JSONB
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  -- Users can only generate their own actions (or admins can generate for self)
  IF p_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot generate actions for another user';
  END IF;

  IF p_task_id IS NOT NULL THEN
    INSERT INTO public.daily_actions (
      organization_id, user_id, production_goal_id, record_id, task_id,
      action_type, title, description, priority, due_date, source, metadata
    ) VALUES (
      p_organization_id, p_user_id, p_production_goal_id, p_record_id, p_task_id,
      COALESCE(p_action_type, 'task'), p_title, p_description,
      COALESCE(p_priority, 'medium'), p_due_date, COALESCE(p_source, 'task'),
      COALESCE(p_metadata, '{}'::jsonb)
    )
    ON CONFLICT (user_id, due_date, task_id) WHERE task_id IS NOT NULL
    DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
                  priority = EXCLUDED.priority, metadata = EXCLUDED.metadata,
                  updated_at = NOW()
    RETURNING id INTO v_id;
  ELSIF p_source = 'goal_pacing' AND p_production_goal_id IS NOT NULL THEN
    INSERT INTO public.daily_actions (
      organization_id, user_id, production_goal_id, record_id, task_id,
      action_type, title, description, priority, due_date, source, metadata
    ) VALUES (
      p_organization_id, p_user_id, p_production_goal_id, p_record_id, p_task_id,
      COALESCE(p_action_type, 'review'), p_title, p_description,
      COALESCE(p_priority, 'medium'), p_due_date, 'goal_pacing',
      COALESCE(p_metadata, '{}'::jsonb)
    )
    ON CONFLICT (user_id, due_date, production_goal_id)
      WHERE production_goal_id IS NOT NULL AND source = 'goal_pacing'
    DO UPDATE SET title = EXCLUDED.title, description = EXCLUDED.description,
                  priority = EXCLUDED.priority, metadata = EXCLUDED.metadata,
                  updated_at = NOW()
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.daily_actions (
      organization_id, user_id, production_goal_id, record_id, task_id,
      action_type, title, description, priority, due_date, source, metadata
    ) VALUES (
      p_organization_id, p_user_id, p_production_goal_id, p_record_id, p_task_id,
      COALESCE(p_action_type, 'general'), p_title, p_description,
      COALESCE(p_priority, 'medium'), p_due_date, COALESCE(p_source, 'manual'),
      COALESCE(p_metadata, '{}'::jsonb)
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.upsert_generated_daily_action(UUID, UUID, TEXT, TEXT, public.task_priority, DATE, TEXT, TEXT, UUID, UUID, UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_generated_daily_action(UUID, UUID, TEXT, TEXT, public.task_priority, DATE, TEXT, TEXT, UUID, UUID, UUID, JSONB) TO authenticated;

-- ── RPC: upsert_daily_progress ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_daily_progress(
  p_organization_id    UUID,
  p_production_goal_id UUID,
  p_date               DATE,
  p_metric_key         TEXT,
  p_target_value       NUMERIC,
  p_actual_value       NUMERIC,
  p_status             TEXT,
  p_metadata           JSONB
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.daily_progress (
    organization_id, user_id, production_goal_id, date, metric_key,
    target_value, actual_value, status, metadata
  )
  VALUES (
    p_organization_id, auth.uid(), p_production_goal_id, p_date, p_metric_key,
    p_target_value, COALESCE(p_actual_value, 0),
    COALESCE(p_status, 'unknown'), COALESCE(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (user_id, date, production_goal_id, metric_key)
  DO UPDATE SET target_value = EXCLUDED.target_value,
                actual_value = EXCLUDED.actual_value,
                status       = EXCLUDED.status,
                metadata     = EXCLUDED.metadata,
                updated_at   = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.upsert_daily_progress(UUID, UUID, DATE, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_daily_progress(UUID, UUID, DATE, TEXT, NUMERIC, NUMERIC, TEXT, JSONB) TO authenticated;
