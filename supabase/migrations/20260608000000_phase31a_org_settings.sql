-- ─────────────────────────────────────────────────────────────────────────
-- Phase 31A — Security Hardening + Organization Settings
--
-- 1. SECURITY FIX: remove the open self-insert policy on organization_members.
--    The old `members_insert_self_as_owner` policy only checked
--    `user_id = auth.uid()` — it never validated the organization_id or role,
--    so ANY authenticated user could insert themselves (as 'owner') into ANY
--    organization whose UUID they could obtain. That is a cross-tenant hole.
--
--    Legitimate membership creation does NOT need this policy:
--      • New-org creation runs through create_organization_with_owner(), which
--        is SECURITY DEFINER and bypasses RLS entirely.
--      • Admin-managed membership is still covered by members_insert_admin.
--      • The future invite flow (Phase 31C) will use a SECURITY DEFINER
--        accept_invitation() RPC — never a client-side self-insert.
--    So there is no longer any public/client path to join an existing org.
--
-- 2. Organization settings columns (additive, all backfill-safe with defaults).
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── Drop the unsafe self-insert policy ───────────────────────────────────
DROP POLICY IF EXISTS "members_insert_self_as_owner" ON public.organization_members;

-- 2 ── Organization settings columns ────────────────────────────────────────
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url            TEXT,
  ADD COLUMN IF NOT EXISTS timezone            TEXT    NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS team_size           INTEGER,
  ADD COLUMN IF NOT EXISTS monthly_volume_goal NUMERIC(20, 2),
  ADD COLUMN IF NOT EXISTS status              TEXT    NOT NULL DEFAULT 'active';

-- Constrain status to known values (org disable lands in a later phase).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_status_check'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT organizations_status_check
      CHECK (status IN ('active', 'disabled'));
  END IF;
END $$;

-- 3 ── Helper for future role-tiered checks (owner-only ops in 31B/31C/31D) ──
-- is_org_member / is_org_admin already exist. Add is_org_owner for completeness;
-- the org-settings UPDATE path keeps using is_org_admin (owner OR admin), so no
-- existing policy changes here.
CREATE OR REPLACE FUNCTION public.is_org_owner(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = 'owner'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
