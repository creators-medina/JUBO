-- ─────────────────────────────────────────────────────────────────────────
-- Phase 19: Headless Cron Worker + Production Sync Reliability
--
-- Makes the integration runtime work WITHOUT a user session. The cron route
-- uses the service-role key (server-only) → auth.role() = 'service_role',
-- auth.uid() = NULL. The workflow-engine RPCs are made service-role-tolerant so
-- the headless worker can execute workflows, while still blocking true anon.
-- A resolved org-owner user id (passed as p_user_id) owns generated daily actions.
--
-- New: worker_runs (observability) + integration_stage_mappings (configurable
-- status→stage routing with order for the backward-movement guard).
-- ─────────────────────────────────────────────────────────────────────────

-- ── set_next_action: + p_user_id, service-role tolerant ──────────────────────
DROP FUNCTION IF EXISTS public.set_next_action(UUID, TEXT, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.set_next_action(
  p_record_id   UUID,
  p_next_action TEXT,
  p_due_at      TIMESTAMPTZ,
  p_user_id     UUID DEFAULT NULL
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  v_user   UUID := COALESCE(p_user_id, auth.uid());
  v_system BOOLEAN := auth.role() IS NOT DISTINCT FROM 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_system THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.records WHERE id = p_record_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT v_system AND NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  UPDATE public.records
  SET next_action = p_next_action, next_action_due_at = p_due_at, next_action_completed_at = NULL
  WHERE id = p_record_id;

  INSERT INTO public.activities (organization_id, record_id, user_id, activity_type, content)
  VALUES (v_org_id, p_record_id, v_user, 'note',
    CASE WHEN p_next_action IS NULL THEN 'Cleared next action' ELSE 'Set next action: ' || p_next_action END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.set_next_action(UUID, TEXT, TIMESTAMPTZ, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_next_action(UUID, TEXT, TIMESTAMPTZ, UUID) TO authenticated, service_role;

-- ── create_daily_action: + p_user_id, service-role tolerant ──────────────────
DROP FUNCTION IF EXISTS public.create_daily_action(UUID, TEXT, TEXT, public.task_priority, DATE, TEXT, TEXT, UUID, UUID, UUID);
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
  p_task_id            UUID,
  p_user_id            UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_id   UUID;
  v_user UUID := COALESCE(p_user_id, auth.uid());
  v_system BOOLEAN := auth.role() IS NOT DISTINCT FROM 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_system THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT v_system AND NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;
  IF v_user IS NULL THEN RAISE EXCEPTION 'No user for daily action'; END IF;

  INSERT INTO public.daily_actions (
    organization_id, user_id, production_goal_id, record_id, task_id,
    action_type, title, description, priority, due_date, source
  )
  VALUES (
    p_organization_id, v_user, p_production_goal_id, p_record_id, p_task_id,
    COALESCE(p_action_type, 'general'), p_title, p_description,
    COALESCE(p_priority, 'medium'), COALESCE(p_due_date, CURRENT_DATE), COALESCE(p_source, 'manual')
  )
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.create_daily_action(UUID, TEXT, TEXT, public.task_priority, DATE, TEXT, TEXT, UUID, UUID, UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_daily_action(UUID, TEXT, TEXT, public.task_priority, DATE, TEXT, TEXT, UUID, UUID, UUID, UUID) TO authenticated, service_role;

-- ── log_workflow_execution: service-role tolerant (no user needed) ───────────
CREATE OR REPLACE FUNCTION public.log_workflow_execution(
  p_organization_id  UUID,
  p_workflow_id      UUID,
  p_template_id      TEXT,
  p_trigger_type     TEXT,
  p_record_id        UUID,
  p_payload          JSONB,
  p_actions_executed JSONB,
  p_status           TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
  v_system BOOLEAN := auth.role() IS NOT DISTINCT FROM 'service_role';
BEGIN
  IF auth.uid() IS NULL AND NOT v_system THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT v_system AND NOT public.is_org_member(p_organization_id) THEN RAISE EXCEPTION 'Not a member'; END IF;

  INSERT INTO public.workflow_executions
    (organization_id, workflow_id, template_id, trigger_type, record_id, payload, actions_executed, status)
  VALUES
    (p_organization_id, p_workflow_id, p_template_id, p_trigger_type, p_record_id,
     COALESCE(p_payload, '{}'::jsonb), COALESCE(p_actions_executed, '[]'::jsonb), COALESCE(p_status, 'success'))
  RETURNING id INTO v_id;

  IF p_workflow_id IS NOT NULL THEN
    UPDATE public.workflows SET execution_count = execution_count + 1, last_run_at = NOW() WHERE id = p_workflow_id;
  END IF;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.log_workflow_execution(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_workflow_execution(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) TO authenticated, service_role;

-- ── worker_runs (observability) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.worker_runs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  worker_type      TEXT NOT NULL,                 -- cron | integration_worker | scheduler
  status           TEXT NOT NULL DEFAULT 'completed', -- completed | failed
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at      TIMESTAMPTZ,
  duration_ms      INTEGER,
  summary          JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message    TEXT
);

CREATE INDEX IF NOT EXISTS worker_runs_org_idx ON public.worker_runs(organization_id, started_at DESC);

ALTER TABLE public.worker_runs ENABLE ROW LEVEL SECURITY;
-- Members read their org's runs; the cron worker writes via service role (bypasses RLS).
CREATE POLICY worker_runs_select ON public.worker_runs FOR SELECT
  USING (organization_id IS NOT NULL AND public.is_org_member(organization_id));
CREATE POLICY worker_runs_insert ON public.worker_runs FOR INSERT
  WITH CHECK (organization_id IS NOT NULL AND public.is_org_member(organization_id));

-- ── integration_stage_mappings (configurable status→stage routing) ───────────
CREATE TABLE IF NOT EXISTS public.integration_stage_mappings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  keyword          TEXT NOT NULL,                 -- lowercased status/milestone substring to match
  board_slug       TEXT NOT NULL,
  group_name       TEXT NOT NULL,
  stage_order      INTEGER NOT NULL DEFAULT 0,    -- global order for the backward-movement guard
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  position         INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, keyword)
);

CREATE INDEX IF NOT EXISTS integration_stage_mappings_org_idx ON public.integration_stage_mappings(organization_id, stage_order);

CREATE TRIGGER integration_stage_mappings_set_updated_at
  BEFORE UPDATE ON public.integration_stage_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.integration_stage_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY integration_stage_mappings_all ON public.integration_stage_mappings FOR ALL
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
