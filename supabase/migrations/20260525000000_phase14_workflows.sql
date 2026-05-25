-- ─────────────────────────────────────────────────────────────────────────
-- Phase 14: Workflow Trigger Engine
--
--   workflows            — per-org enabled state for code-defined templates
--   workflow_executions  — immutable audit log of every fire
--
-- The engine itself lives in TypeScript (features/workflows). Templates are
-- code-defined and "installed" per org as workflow rows so they can be
-- enabled/disabled and counted. No mortgage logic in the schema.
-- ─────────────────────────────────────────────────────────────────────────

-- ── workflows ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflows (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id      TEXT NOT NULL,                 -- code template key
  title            TEXT NOT NULL,
  description      TEXT,
  trigger_type     TEXT NOT NULL,
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  config           JSONB NOT NULL DEFAULT '{}'::jsonb,
  execution_count  INTEGER NOT NULL DEFAULT 0,
  last_run_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, template_id)
);

CREATE INDEX IF NOT EXISTS workflows_org_trigger_idx
  ON public.workflows(organization_id, trigger_type) WHERE enabled = TRUE;

CREATE TRIGGER workflows_set_updated_at
  BEFORE UPDATE ON public.workflows
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflows_select ON public.workflows FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY workflows_update ON public.workflows FOR UPDATE
  USING (public.is_org_member(organization_id));
CREATE POLICY workflows_delete ON public.workflows FOR DELETE
  USING (public.is_org_admin(organization_id));

-- ── workflow_executions (immutable audit) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workflow_executions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workflow_id       UUID REFERENCES public.workflows(id) ON DELETE SET NULL,
  template_id       TEXT,
  trigger_type      TEXT NOT NULL,
  record_id         UUID REFERENCES public.records(id) ON DELETE SET NULL,
  payload           JSONB NOT NULL DEFAULT '{}'::jsonb,
  actions_executed  JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL DEFAULT 'success',   -- success | skipped | partial | failed
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS workflow_executions_org_idx    ON public.workflow_executions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_executions_record_idx ON public.workflow_executions(record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workflow_executions_wf_idx     ON public.workflow_executions(workflow_id, created_at DESC);

ALTER TABLE public.workflow_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workflow_executions_select ON public.workflow_executions FOR SELECT
  USING (public.is_org_member(organization_id));

-- ── RPC: ensure_default_workflows ───────────────────────────────────────────
-- Installs (idempotently) the given code templates as workflow rows for an org.
-- p_templates is a JSONB array of { template_id, title, description, trigger_type }.
CREATE OR REPLACE FUNCTION public.ensure_default_workflows(
  p_organization_id UUID,
  p_templates       JSONB
) RETURNS VOID AS $$
DECLARE
  t JSONB;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  FOR t IN SELECT * FROM jsonb_array_elements(COALESCE(p_templates, '[]'::jsonb))
  LOOP
    INSERT INTO public.workflows (organization_id, template_id, title, description, trigger_type)
    VALUES (
      p_organization_id,
      t->>'template_id',
      t->>'title',
      t->>'description',
      t->>'trigger_type'
    )
    ON CONFLICT (organization_id, template_id) DO UPDATE
      SET title = EXCLUDED.title,
          description = EXCLUDED.description,
          trigger_type = EXCLUDED.trigger_type,
          updated_at = NOW();
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.ensure_default_workflows(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ensure_default_workflows(UUID, JSONB) TO authenticated;

-- ── RPC: set_workflow_enabled ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_workflow_enabled(
  p_workflow_id UUID,
  p_enabled     BOOLEAN
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT organization_id INTO v_org_id FROM public.workflows WHERE id = p_workflow_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Workflow not found'; END IF;
  IF NOT public.is_org_member(v_org_id) THEN RAISE EXCEPTION 'Not a member'; END IF;

  UPDATE public.workflows SET enabled = COALESCE(p_enabled, TRUE) WHERE id = p_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.set_workflow_enabled(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_workflow_enabled(UUID, BOOLEAN) TO authenticated;

-- ── RPC: log_workflow_execution ─────────────────────────────────────────────
-- Inserts an audit row and bumps the workflow's counter + last_run_at.
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
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN RAISE EXCEPTION 'Not a member'; END IF;

  INSERT INTO public.workflow_executions
    (organization_id, workflow_id, template_id, trigger_type, record_id, payload, actions_executed, status)
  VALUES
    (p_organization_id, p_workflow_id, p_template_id, p_trigger_type, p_record_id,
     COALESCE(p_payload, '{}'::jsonb), COALESCE(p_actions_executed, '[]'::jsonb), COALESCE(p_status, 'success'))
  RETURNING id INTO v_id;

  IF p_workflow_id IS NOT NULL THEN
    UPDATE public.workflows
      SET execution_count = execution_count + 1, last_run_at = NOW()
      WHERE id = p_workflow_id;
  END IF;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.log_workflow_execution(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_workflow_execution(UUID, UUID, TEXT, TEXT, UUID, JSONB, JSONB, TEXT) TO authenticated;
