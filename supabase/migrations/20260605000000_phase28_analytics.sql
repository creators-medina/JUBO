-- ─────────────────────────────────────────────────────────────────────────
-- Phase 28 — Lightweight product analytics + in-app feedback.
--
-- Privacy-first: append-only NAMED events with structured props (no URLs/PII
-- beyond org/user IDs). Members can only INSERT their own rows; only org admins
-- can SELECT (read aggregates). Feedback follows the same shape.
-- ─────────────────────────────────────────────────────────────────────────

-- ── analytics_events ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_name      TEXT NOT NULL,                       -- 'page_view' | 'prospecting_outcome' | ...
  props           JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { surface: 'today', outcome: 'interested' }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS analytics_events_org_idx   ON public.analytics_events(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_event_idx ON public.analytics_events(organization_id, event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS analytics_events_user_idx  ON public.analytics_events(organization_id, user_id, created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Members may only write their own events; only admins may read.
CREATE POLICY analytics_events_insert ON public.analytics_events FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY analytics_events_select ON public.analytics_events FOR SELECT
  USING (public.is_org_admin(organization_id));

-- ── feedback_submissions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feedback_type   TEXT NOT NULL DEFAULT 'general',     -- bug | feature | general
  title           TEXT NOT NULL,
  description     TEXT,
  status          TEXT NOT NULL DEFAULT 'new',         -- new | acknowledged | in_progress | resolved | wontfix
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,  -- { pathname, ... }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS feedback_submissions_org_idx    ON public.feedback_submissions(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_submissions_status_idx ON public.feedback_submissions(organization_id, status);

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

-- Members submit their own; the submitter or an admin may read; admins manage status.
CREATE POLICY feedback_submissions_insert ON public.feedback_submissions FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY feedback_submissions_select ON public.feedback_submissions FOR SELECT
  USING (user_id = auth.uid() OR public.is_org_admin(organization_id));
CREATE POLICY feedback_submissions_update ON public.feedback_submissions FOR UPDATE
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER feedback_submissions_set_updated_at
  BEFORE UPDATE ON public.feedback_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
