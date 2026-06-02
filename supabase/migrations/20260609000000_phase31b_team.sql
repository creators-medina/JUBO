-- ─────────────────────────────────────────────────────────────────────────
-- Phase 31B — Team Management
--
-- Adds a per-membership status so owners/admins can DISABLE a teammate's
-- access without deleting their account or their history. A disabled member
-- keeps their auth.users row, their profile, and everything they authored —
-- they simply lose access to this organization's data.
--
-- "Lose access" is enforced at the RLS layer: is_org_member / is_org_admin now
-- require an ACTIVE membership. Every existing member defaults to 'active', so
-- no one loses access on deploy.
--
-- No invitations here (Phase 31C). No new roles (still owner/admin/manager/member).
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── Per-membership status ────────────────────────────────────────────────
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_status_check'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_status_check
      CHECK (status IN ('active', 'disabled'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_members_status
  ON public.organization_members(organization_id, status);

-- 2 ── Fold status into the membership helpers ──────────────────────────────
-- Disabled members are no longer "members" for the purposes of data access.
CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_org_owner(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
      AND user_id = auth.uid()
      AND role = 'owner'
      AND status = 'active'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;
