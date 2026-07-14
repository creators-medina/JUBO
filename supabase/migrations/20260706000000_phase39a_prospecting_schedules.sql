-- ─────────────────────────────────────────────────────────────────────────
-- Phase 39A — Prospecting schedules (editable per-day board pull config).
--
-- Replaces the hardcoded theme-day board weighting (themeDay.ts, which only
-- nudged the score) with a real, user-editable weekly schedule: for each
-- weekday choose which board(s) the call queue pulls from, an optional per-day
-- target, plus a strict / backfill toggle.
--
--   • One row per user (user_id set) holds that user's schedule.
--   • An optional org-default row (user_id NULL) seeds the org; only admins may
--     write it. A user's own row always wins over the org default.
--   • No config at all → legacy behavior (queue scores across ALL boards).
--
-- Additive + fully backward compatible: with zero rows the queue behaves
-- exactly as before. Keyed off board IDs, so board rename/reslug is safe.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prospecting_schedules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,   -- NULL = org default
  enabled          BOOLEAN NOT NULL DEFAULT TRUE,
  strict           BOOLEAN NOT NULL DEFAULT FALSE,   -- TRUE = scheduled boards only (no backfill)
  -- week: { "0".."6" (JS weekday, 0=Sun) → { mode:'any'|'boards'|'off', boardIds:uuid[], target:int|null } }
  week             JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- At most one schedule per user (plain index → clean ON CONFLICT arbiter for the
-- user upsert; NULL user_ids are distinct so org defaults are not constrained
-- here). A separate partial index enforces a single org-default row per org.
CREATE UNIQUE INDEX IF NOT EXISTS prospecting_schedules_user_uq
  ON public.prospecting_schedules(organization_id, user_id);
CREATE UNIQUE INDEX IF NOT EXISTS prospecting_schedules_org_default_uq
  ON public.prospecting_schedules(organization_id) WHERE user_id IS NULL;

ALTER TABLE public.prospecting_schedules ENABLE ROW LEVEL SECURITY;

-- Members read their own schedule + the org default; admins can read all.
CREATE POLICY prospecting_schedules_select ON public.prospecting_schedules FOR SELECT
  USING (
    public.is_org_member(organization_id)
    AND (user_id = auth.uid() OR user_id IS NULL OR public.is_org_admin(organization_id))
  );

-- A user writes only their own row.
CREATE POLICY prospecting_schedules_insert_own ON public.prospecting_schedules FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY prospecting_schedules_update_own ON public.prospecting_schedules FOR UPDATE
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY prospecting_schedules_delete_own ON public.prospecting_schedules FOR DELETE
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));

-- Admins manage the org-default row (user_id NULL). Multiple permissive policies
-- combine with OR, so this coexists with the per-user policies above.
CREATE POLICY prospecting_schedules_admin_default_insert ON public.prospecting_schedules FOR INSERT
  WITH CHECK (user_id IS NULL AND public.is_org_admin(organization_id));
CREATE POLICY prospecting_schedules_admin_default_update ON public.prospecting_schedules FOR UPDATE
  USING (user_id IS NULL AND public.is_org_admin(organization_id))
  WITH CHECK (user_id IS NULL AND public.is_org_admin(organization_id));
