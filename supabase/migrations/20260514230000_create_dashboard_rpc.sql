-- Atomic dashboard creation RPC — bypasses RLS safely via SECURITY DEFINER.
-- auth.uid() is enforced inside the function body.
-- Org membership is verified before insert.
-- Only callable by authenticated users.

CREATE OR REPLACE FUNCTION public.create_dashboard_for_member(
  p_organization_id UUID,
  p_name            TEXT,
  p_slug            TEXT,
  p_description     TEXT    DEFAULT NULL,
  p_icon            TEXT    DEFAULT NULL,
  p_color           TEXT    DEFAULT NULL,
  p_is_default      BOOLEAN DEFAULT FALSE
)
RETURNS UUID AS $$
DECLARE
  v_user_id      UUID;
  v_dashboard_id UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify the caller is a member of the target org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_organization_id
      AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.dashboards (
    organization_id, name, slug, description, icon, color, is_default, created_by
  )
  VALUES (
    p_organization_id, p_name, p_slug, p_description, p_icon, p_color, p_is_default, v_user_id
  )
  RETURNING id INTO v_dashboard_id;

  RETURN v_dashboard_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restrict to authenticated users only
REVOKE ALL ON FUNCTION public.create_dashboard_for_member(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_dashboard_for_member(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;
