-- ─────────────────────────────────────────────────────────────────────────
-- Phase 33A — Producer / Support classification (foundation only)
--
-- Mortgage teams split into PRODUCERS (loan officers, producing managers — who
-- own a business plan) and SUPPORT (LOA, processor, ISA, VA, TC — who help a
-- producer execute theirs). This phase only records WHO is which and WHICH
-- producers each support user serves. NOTHING downstream (coaching, goals,
-- Today, forecasts, execution score, workflows) reads these yet — pure
-- classification, safe to deploy with zero behavior change.
--
-- Every existing member defaults to 'producer', so today's single-user / flat
-- behavior is preserved exactly.
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── Member classification ────────────────────────────────────────────────
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS member_type TEXT NOT NULL DEFAULT 'producer';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organization_members_member_type_check'
  ) THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_member_type_check
      CHECK (member_type IN ('producer', 'support'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_org_members_member_type
  ON public.organization_members(organization_id, member_type);

-- 2 ── Support → Producer links (M:N within one org) ────────────────────────
CREATE TABLE IF NOT EXISTS public.producer_support_links (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  producer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  support_user_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, producer_user_id, support_user_id),
  -- A user can never be linked to themselves.
  CONSTRAINT producer_support_links_distinct CHECK (producer_user_id <> support_user_id)
);

CREATE INDEX IF NOT EXISTS idx_psl_org_producer ON public.producer_support_links(organization_id, producer_user_id);
CREATE INDEX IF NOT EXISTS idx_psl_org_support  ON public.producer_support_links(organization_id, support_user_id);

-- 3 ── RLS — org members read; only owners/admins mutate ────────────────────
-- (Producer/support member_type correctness + same-org membership are enforced
--  server-side in the admin-gated actions; RLS is the defense-in-depth layer.)
ALTER TABLE public.producer_support_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "psl_select_org_members" ON public.producer_support_links
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "psl_write_admin" ON public.producer_support_links
  FOR ALL USING (is_org_admin(organization_id))
  WITH CHECK (is_org_admin(organization_id));
