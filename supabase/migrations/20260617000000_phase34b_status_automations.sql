-- ─────────────────────────────────────────────────────────────────────────
-- Phase 34B — Status-change automations ("when status = X, move to group Y").
--
-- Custom, user-created automations live in the existing `workflows` table:
--   • board_id   → scopes the rule to one board (null = org-wide legacy rules)
--   • template_id → a unique "custom:status_to_group:<uuid>" key (keeps the
--                   existing UNIQUE(org, template_id); no constraint change)
--   • config     → the rule itself { kind, trigger, action } (JSONB, already present)
-- Code-defined (registry) workflows keep working unchanged.
--
-- INSERT has no RLS policy on workflows (only the SECURITY DEFINER RPCs write),
-- so create/delete go through the RPCs below.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES public.boards(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_workflows_board ON public.workflows(board_id) WHERE board_id IS NOT NULL;

-- Create a custom (DB-defined) workflow row. Org-member gated.
CREATE OR REPLACE FUNCTION public.create_custom_workflow(
  p_organization_id UUID,
  p_board_id        UUID,
  p_template_id     TEXT,
  p_title           TEXT,
  p_trigger_type    TEXT,
  p_config          JSONB
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN RAISE EXCEPTION 'Not a member of this organization'; END IF;
  -- If a board is given, it must belong to the same org.
  IF p_board_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.boards WHERE id = p_board_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Board not in organization';
  END IF;

  INSERT INTO public.workflows (organization_id, board_id, template_id, title, trigger_type, enabled, config)
  VALUES (p_organization_id, p_board_id, p_template_id, p_title, p_trigger_type, TRUE, COALESCE(p_config, '{}'::jsonb))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_custom_workflow(UUID, UUID, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_custom_workflow(UUID, UUID, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- Delete a workflow (org-member gated — lets board managers remove their own
-- automations; the table's admin-only DELETE policy still applies to direct deletes).
CREATE OR REPLACE FUNCTION public.delete_workflow(p_workflow_id UUID) RETURNS VOID AS $$
DECLARE
  v_org UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT organization_id INTO v_org FROM public.workflows WHERE id = p_workflow_id;
  IF v_org IS NULL THEN RETURN; END IF;
  IF NOT public.is_org_member(v_org) THEN RAISE EXCEPTION 'Not a member of this organization'; END IF;
  DELETE FROM public.workflows WHERE id = p_workflow_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.delete_workflow(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_workflow(UUID) TO authenticated;
