-- ─────────────────────────────────────────────────────────────────────────
-- Phase 31C — Team Invite Flow
--
-- Lets owners/admins invite a user into the EXISTING organization. Tokens are
-- random + single-use + hashed at rest (only the SHA-256 hash is stored) and
-- expire in 7 days.
--
-- Membership is NEVER created by a client insert (Phase 31A hardening stays
-- intact). Acceptance goes through accept_invitation() — a SECURITY DEFINER
-- RPC that verifies token hash / status / expiry / EMAIL MATCH / org / not-
-- already-a-member before inserting the organization_members row itself.
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── Invitations table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  first_name       TEXT,
  last_name        TEXT,
  role             public.org_role NOT NULL DEFAULT 'member',
  token_hash       TEXT NOT NULL,
  invited_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  expires_at       TIMESTAMPTZ NOT NULL,
  accepted_at      TIMESTAMPTZ,
  accepted_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_invitations_status_check
    CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  -- Inviting an owner is an ownership transfer (a later phase) — disallow here.
  CONSTRAINT organization_invitations_role_check
    CHECK (role IN ('admin', 'manager', 'member'))
);

CREATE INDEX IF NOT EXISTS idx_org_invites_org ON public.organization_invitations(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_org_invites_token ON public.organization_invitations(token_hash);
-- At most one PENDING invite per email per org.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_org_invites_pending
  ON public.organization_invitations(organization_id, lower(email))
  WHERE status = 'pending';

CREATE TRIGGER set_org_invitations_updated_at
  BEFORE UPDATE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2 ── RLS: only org admins manage their org's invites ──────────────────────
-- (Logged-out preview + acceptance go through SECURITY DEFINER RPCs below,
--  which bypass RLS — there is no anon read path to the table directly.)
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invites_select_admin" ON public.organization_invitations
  FOR SELECT USING (is_org_admin(organization_id));

CREATE POLICY "org_invites_insert_admin" ON public.organization_invitations
  FOR INSERT WITH CHECK (is_org_admin(organization_id) AND invited_by = auth.uid());

CREATE POLICY "org_invites_update_admin" ON public.organization_invitations
  FOR UPDATE USING (is_org_admin(organization_id));

-- 3 ── Preview RPC (safe for logged-out users) ──────────────────────────────
-- Returns just enough to render the accept screen. Never exposes the token.
CREATE OR REPLACE FUNCTION public.invitation_preview(p_token_hash TEXT)
RETURNS JSONB AS $$
DECLARE
  v_inv  public.organization_invitations%ROWTYPE;
  v_org  public.organizations%ROWTYPE;
BEGIN
  SELECT * INTO v_inv FROM public.organization_invitations WHERE token_hash = p_token_hash;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_inv.organization_id;

  RETURN jsonb_build_object(
    'found', true,
    'email', v_inv.email,
    'role', v_inv.role::text,
    'first_name', v_inv.first_name,
    'last_name', v_inv.last_name,
    'status', v_inv.status,
    'expired', (v_inv.status = 'pending' AND v_inv.expires_at < NOW()),
    'organization_name', COALESCE(v_org.name, 'this organization')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE ALL ON FUNCTION public.invitation_preview(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.invitation_preview(TEXT) TO anon, authenticated;

-- 4 ── Accept RPC (authenticated only) ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token_hash TEXT)
RETURNS JSONB AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_email  TEXT;
  v_inv    public.organization_invitations%ROWTYPE;
  v_org    public.organizations%ROWTYPE;
  v_exists BOOLEAN;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('error', 'not_authenticated');
  END IF;

  -- Lock the invite row so single-use is race-safe.
  SELECT * INTO v_inv FROM public.organization_invitations
    WHERE token_hash = p_token_hash FOR UPDATE;
  IF v_inv.id IS NULL THEN
    RETURN jsonb_build_object('error', 'invalid');
  END IF;

  IF v_inv.status = 'revoked'  THEN RETURN jsonb_build_object('error', 'revoked');   END IF;
  IF v_inv.status = 'accepted' THEN RETURN jsonb_build_object('error', 'already_used'); END IF;

  IF v_inv.expires_at < NOW() THEN
    UPDATE public.organization_invitations
      SET status = 'expired', updated_at = NOW() WHERE id = v_inv.id;
    RETURN jsonb_build_object('error', 'expired');
  END IF;

  -- Email match — the signed-in user must own the invited address.
  SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  IF v_email IS NULL OR lower(v_email) <> lower(v_inv.email) THEN
    RETURN jsonb_build_object('error', 'email_mismatch', 'invited_email', v_inv.email);
  END IF;

  SELECT * INTO v_org FROM public.organizations WHERE id = v_inv.organization_id;
  IF v_org.id IS NULL THEN
    RETURN jsonb_build_object('error', 'org_missing');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_inv.organization_id AND user_id = v_uid
  ) INTO v_exists;

  IF NOT v_exists THEN
    INSERT INTO public.organization_members (organization_id, user_id, role, status, invited_by, joined_at)
    VALUES (v_inv.organization_id, v_uid, v_inv.role, 'active', v_inv.invited_by, NOW());
  END IF;

  UPDATE public.organization_invitations
    SET status = 'accepted', accepted_at = NOW(), accepted_user_id = v_uid, updated_at = NOW()
    WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'already_member', v_exists,
    'organization_id', v_inv.organization_id,
    'organization_slug', v_org.slug,
    'organization_name', v_org.name
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.accept_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.accept_invitation(TEXT) TO authenticated;
