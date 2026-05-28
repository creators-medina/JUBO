-- ─────────────────────────────────────────────────────────────────────────
-- Phase 24 — Revenue Intelligence + Coaching Engine.
--
-- DOCTRINE: turn Jubo into a mortgage business operating system / coach.
--   * Track "talk-tos" (real conversations), not raw dials.
--   * Reverse-engineer income goal -> closings -> leads -> partners -> daily talk-tos.
--   * Baselines are ALWAYS org/user overridable, never hardcoded permanently.
--   * Self-correcting: measure actual rates, recommend updates, never auto-overwrite.
--
-- This migration is intentionally lean: one durable table for overridable
-- baselines, plus the widget allowlist. Targets, execution scores, forecasts and
-- partner metrics are computed ON-READ from existing data (goals, records,
-- communication_logs) so there is no dead schema or snapshot job to maintain.
-- All business math lives under features/coaching/ — generic engines stay generic.
-- ─────────────────────────────────────────────────────────────────────────

-- ── coaching_assumptions: overridable baselines ────────────────────────────
-- One active row per org (user_id NULL = org default) and one per user override.
CREATE TABLE IF NOT EXISTS public.coaching_assumptions (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id                      UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- NULL = org-wide baseline

  -- Partner / lead math (Partners -> Leads -> Closings framework)
  leads_per_partner            NUMERIC(8,2)  NOT NULL DEFAULT 8,      -- yearly leads per committed partner
  conversations_per_partner    NUMERIC(8,2)  NOT NULL DEFAULT 20,     -- yearly conversations to acquire/maintain a partner
  referral_conversion_rate     NUMERIC(6,5)  NOT NULL DEFAULT 0.25,   -- referral lead -> funded (0..1)

  -- Production math
  working_weeks_per_year       NUMERIC(5,2)  NOT NULL DEFAULT 50,
  working_days_per_week        NUMERIC(4,2)  NOT NULL DEFAULT 5,
  avg_commission               NUMERIC(14,2),                          -- $ per funded loan (income -> closings)
  avg_loan_size                NUMERIC(14,2),                          -- $ loan amount (volume targets)
  lead_to_funded_rate          NUMERIC(6,5)  NOT NULL DEFAULT 0.25,    -- overall lead -> funded (0..1)

  -- Funnel-step conversion rates (overridable; default to platform starters)
  lead_to_connected_rate       NUMERIC(6,5)  NOT NULL DEFAULT 0.40,    -- lead -> real conversation (talk-to)
  connected_to_app_rate        NUMERIC(6,5)  NOT NULL DEFAULT 0.50,
  app_to_preapproved_rate      NUMERIC(6,5)  NOT NULL DEFAULT 0.45,
  preapproved_to_closed_rate   NUMERIC(6,5)  NOT NULL DEFAULT 0.85,

  -- Execution thresholds
  weekly_talk_to_floor_percent NUMERIC(5,2)  NOT NULL DEFAULT 80,      -- floor for "on pace" / streak credit
  stale_boundary_days          INTEGER       NOT NULL DEFAULT 21,      -- partner cooling off
  partner_at_risk_days         INTEGER       NOT NULL DEFAULT 60,      -- partner dormant / at risk

  notes                        TEXT,
  created_by                   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- At most one org-wide row and one row per user (partial unique indexes handle NULL user_id).
CREATE UNIQUE INDEX IF NOT EXISTS coaching_assumptions_org_default_uidx
  ON public.coaching_assumptions(organization_id) WHERE user_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS coaching_assumptions_user_uidx
  ON public.coaching_assumptions(organization_id, user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS coaching_assumptions_org_idx
  ON public.coaching_assumptions(organization_id);

ALTER TABLE public.coaching_assumptions ENABLE ROW LEVEL SECURITY;

-- Members read org-wide + their own; users write their own row; admins write the org-wide row.
CREATE POLICY coaching_assumptions_select ON public.coaching_assumptions FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY coaching_assumptions_insert ON public.coaching_assumptions FOR INSERT
  WITH CHECK (
    public.is_org_member(organization_id)
    AND (
      (user_id = auth.uid())
      OR (user_id IS NULL AND public.is_org_admin(organization_id))
    )
  );
CREATE POLICY coaching_assumptions_update ON public.coaching_assumptions FOR UPDATE
  USING (
    (user_id = auth.uid())
    OR (user_id IS NULL AND public.is_org_admin(organization_id))
  )
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY coaching_assumptions_delete ON public.coaching_assumptions FOR DELETE
  USING (
    (user_id = auth.uid())
    OR (user_id IS NULL AND public.is_org_admin(organization_id))
  );

CREATE TRIGGER coaching_assumptions_set_updated_at
  BEFORE UPDATE ON public.coaching_assumptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Widget allowlist: add the 8 coaching widgets ───────────────────────────
ALTER TABLE public.dashboard_widgets
  DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets
  ADD CONSTRAINT dashboard_widgets_widget_type_check
  CHECK (widget_type IN (
    'metric', 'list', 'board_summary', 'activity_feed', 'saved_view',
    'goal_progress', 'funnel_pace', 'gap_analysis',
    'today_summary', 'daily_actions_list',
    'prospecting_summary', 'connection_rate', 'hot_leads', 'followups_due', 'active_call_session',
    'execution_score', 'talk_to_pace', 'partner_growth', 'projected_closings',
    'projected_income', 'partner_health', 'pace_forecast', 'weekly_scorecard'
  ));
