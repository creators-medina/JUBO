-- ─────────────────────────────────────────────────────────────────────────
-- Phase 33B — Producer-owned business plans (data ownership + resolution only)
--
-- Production goals were org-owned (organization_id + created_by metadata only).
-- This phase records WHICH PRODUCER owns each goal so coaching / Today / pacing
-- can resolve "this producer's plan" instead of "the org's first goal".
--
-- Additive + safe: nullable column, backfilled from the goal's creator (the
-- producer who built it during onboarding) → org owner → NULL. Nothing is
-- archived, merged, or deleted. NO unique constraint yet (deferred to 33C).
-- In a solo org the producer == the only user, so behavior is identical.
-- ─────────────────────────────────────────────────────────────────────────

-- 1 ── Ownership column ─────────────────────────────────────────────────────
ALTER TABLE public.production_goals
  ADD COLUMN IF NOT EXISTS producer_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_production_goals_producer
  ON public.production_goals(organization_id, producer_user_id);

-- 2 ── Backfill ─────────────────────────────────────────────────────────────
-- (a) creator, when the creator is a 'producer' member of the goal's org.
UPDATE public.production_goals g
SET producer_user_id = g.created_by
WHERE g.producer_user_id IS NULL
  AND g.created_by IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = g.organization_id
      AND m.user_id = g.created_by
      AND m.member_type = 'producer'
  );

-- (b) otherwise the org owner.
UPDATE public.production_goals g
SET producer_user_id = o.owner_user_id
FROM public.organizations o
WHERE g.producer_user_id IS NULL
  AND o.id = g.organization_id
  AND o.owner_user_id IS NOT NULL;

-- (c) anything still unresolved stays NULL → legacy org-wide behavior.

-- 3 ── Stamp ownership on new goals ─────────────────────────────────────────
-- create_production_goal already runs in the creator's session, so auth.uid()
-- is the producer building the plan (onboarding user or the LO creating one).
-- Signature is unchanged — only the INSERT gains producer_user_id.
CREATE OR REPLACE FUNCTION public.create_production_goal(
  p_organization_id UUID,
  p_funnel_id       UUID,
  p_name            TEXT,
  p_timeframe       TEXT,
  p_start_date      DATE,
  p_end_date        DATE,
  p_target_units    NUMERIC,
  p_target_volume   NUMERIC,
  p_target_revenue  NUMERIC
) RETURNS UUID AS $$
DECLARE
  v_goal_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.production_goals (
    organization_id, funnel_id, name, timeframe, start_date, end_date,
    target_units, target_volume, target_revenue, created_by, producer_user_id
  )
  VALUES (
    p_organization_id, p_funnel_id, p_name, COALESCE(p_timeframe, 'yearly'),
    p_start_date, p_end_date,
    p_target_units, p_target_volume, p_target_revenue, auth.uid(), auth.uid()
  )
  RETURNING id INTO v_goal_id;

  RETURN v_goal_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
