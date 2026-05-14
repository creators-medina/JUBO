-- Atomic org creation RPC — bypasses RLS safely via SECURITY DEFINER.
-- auth.uid() is still enforced inside the function body.
-- Only callable by authenticated users.

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  org_name TEXT,
  org_slug TEXT
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.organizations (name, slug, owner_user_id)
  VALUES (org_name, org_slug, v_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, joined_at)
  VALUES (v_org_id, v_user_id, 'owner', NOW());

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Restrict to authenticated users only
REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;
