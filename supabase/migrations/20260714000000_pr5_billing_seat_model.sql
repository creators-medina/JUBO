-- ─────────────────────────────────────────────────────────────────────────
-- PR 5 — Billing / Seat Model Foundation (private-beta, manual billing).
--
-- Additive + inert-by-default. Adds minimal billing/seat columns to
-- organizations and a seat check in accept_invitation(). Nothing charges money,
-- no Stripe code, no secrets stored (only Stripe IDs, which are not secrets).
--
-- EXISTING-ORG SAFETY: seat_limit defaults to NULL = UNLIMITED, so every
-- existing org (incl. Medina/BOMAC) and every new org is unconstrained until an
-- admin/vendor explicitly sets a numeric seat_limit. Enforcement blocks ONLY
-- new invite-accepts over a configured limit — it never deletes members, never
-- blocks existing members, and never affects login/app access.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS / guarded CHECKs / CREATE OR REPLACE.
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── Billing / seat columns on organizations ──────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS plan_type             TEXT        NOT NULL DEFAULT 'beta',
  ADD COLUMN IF NOT EXISTS seat_limit            INTEGER,                       -- NULL = unlimited
  ADD COLUMN IF NOT EXISTS billing_status        TEXT        NOT NULL DEFAULT 'not_configured',
  ADD COLUMN IF NOT EXISTS trial_ends_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_customer_id    TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_price_id       TEXT,
  ADD COLUMN IF NOT EXISTS current_period_end    TIMESTAMPTZ;

-- Constrain the enum-ish text columns to known values (idempotent guards).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_plan_type_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_plan_type_check
      CHECK (plan_type IN ('internal', 'beta', 'paid_beta', 'trial', 'suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_billing_status_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_billing_status_check
      CHECK (billing_status IN ('not_configured', 'trialing', 'active', 'past_due', 'canceled', 'suspended'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_seat_limit_check') THEN
    ALTER TABLE public.organizations ADD CONSTRAINT organizations_seat_limit_check
      CHECK (seat_limit IS NULL OR seat_limit >= 1);
  END IF;
END $$;

-- No RLS changes: existing organizations SELECT (member) / UPDATE (admin)
-- policies already cover the new columns. Stripe IDs are identifiers, not keys.

-- 2 ── Seat enforcement at the invite-acceptance choke point ─────────────────
-- Recreated verbatim from phase 31C with ONE addition: when the org has a
-- seat_limit AND a NEW membership would exceed it, return seat_limit_reached
-- instead of inserting. Re-accepts (already a member) and the owner-creation
-- path (create_organization_with_owner, untouched) are never affected.
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token_hash TEXT)
RETURNS JSONB AS $$
DECLARE
  v_uid    UUID := auth.uid();
  v_email  TEXT;
  v_inv    public.organization_invitations%ROWTYPE;
  v_org    public.organizations%ROWTYPE;
  v_exists BOOLEAN;
  v_active INTEGER;
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
    -- Seat enforcement (inert unless seat_limit is set). Only blocks a NEW
    -- membership; existing members and re-accepts are never affected.
    IF v_org.seat_limit IS NOT NULL THEN
      SELECT count(*) INTO v_active FROM public.organization_members
        WHERE organization_id = v_inv.organization_id AND status = 'active';
      IF v_active >= v_org.seat_limit THEN
        RETURN jsonb_build_object('error', 'seat_limit_reached');
      END IF;
    END IF;

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
