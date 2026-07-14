-- ─────────────────────────────────────────────────────────────────────────
-- Gated Batch PR 10B — weekly_activity_entries (manual tracker persistence)
--
-- Backend home for the Manual Greatness Tracker's weekly grid, so an LO's
-- scoreboard survives device switches and browser clears. Approved shape per
-- docs/JUBO_GATED_SCHEMA_BATCH_PLAN.md §2A (Q1–Q2 answered):
--
--   • One row per (org, user, week's Monday, activity) — SQL-aggregatable
--     for future team reporting, per-cell integrity checks, no cross-tab
--     read-modify-write races.
--   • week_start_date is the week's LOCAL Monday (same identity as the
--     app's mondayKeyOf / existing localStorage keys) — enforced Monday.
--   • Counts mirror the UI's sanitize rules exactly (integers 0–999;
--     an empty cell saves as 0).
--   • activity_key values are product-owned in the app
--     (features/prospecting/greatness/manualTracker.ts ACTIVITIES) —
--     TEXT, not an enum, so adding a row later needs no migration.
--
-- RLS (approved): org members can READ (team/manager visibility is the
-- point of persistence); INSERT/UPDATE are own-rows-only via auth.uid()
-- (present through the @supabase/ssr clients — the phase 15 pattern).
-- No DELETE policy: RLS default-denies deletes; cells zero out instead.
--
-- Schema only — no app code reads or writes this table yet (that is
-- PR 10C). Manual entries remain scoreboard-only and never touch CRM data.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.weekly_activity_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start_date DATE NOT NULL CHECK (EXTRACT(ISODOW FROM week_start_date) = 1),
  activity_key    TEXT NOT NULL CHECK (activity_key <> '' AND char_length(activity_key) <= 64),
  monday_count    SMALLINT NOT NULL DEFAULT 0 CHECK (monday_count    BETWEEN 0 AND 999),
  tuesday_count   SMALLINT NOT NULL DEFAULT 0 CHECK (tuesday_count   BETWEEN 0 AND 999),
  wednesday_count SMALLINT NOT NULL DEFAULT 0 CHECK (wednesday_count BETWEEN 0 AND 999),
  thursday_count  SMALLINT NOT NULL DEFAULT 0 CHECK (thursday_count  BETWEEN 0 AND 999),
  friday_count    SMALLINT NOT NULL DEFAULT 0 CHECK (friday_count    BETWEEN 0 AND 999),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, user_id, week_start_date, activity_key)
);

-- Future team/week reporting (per-user reads are covered by the unique key).
CREATE INDEX IF NOT EXISTS weekly_activity_entries_org_week_idx
  ON public.weekly_activity_entries(organization_id, week_start_date);

CREATE TRIGGER weekly_activity_entries_set_updated_at
  BEFORE UPDATE ON public.weekly_activity_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.weekly_activity_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY weekly_activity_entries_select ON public.weekly_activity_entries
  FOR SELECT USING (public.is_org_member(organization_id));

CREATE POLICY weekly_activity_entries_insert ON public.weekly_activity_entries
  FOR INSERT WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());

CREATE POLICY weekly_activity_entries_update ON public.weekly_activity_entries
  FOR UPDATE USING (public.is_org_member(organization_id) AND user_id = auth.uid())
  WITH CHECK (public.is_org_member(organization_id) AND user_id = auth.uid());
