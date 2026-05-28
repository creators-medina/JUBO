-- ─────────────────────────────────────────────────────────────────────────
-- Phase 22: Prospecting Cockpit — daily calling sessions.
--
--   prospecting_sessions — an execution block (start → end) per user. Live
--   stats are derived from communication_logs since started_at; the counters
--   here are a snapshot written on end (cheap, no per-call triggers).
--
-- Future-ready for Twilio/dialer/AI: those would write communication_logs and
-- this session stays the framing object. RLS: a user owns their own sessions.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.prospecting_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ,
  target_calls     INTEGER NOT NULL DEFAULT 0,
  attempted_calls  INTEGER NOT NULL DEFAULT 0,
  connected_calls  INTEGER NOT NULL DEFAULT 0,
  voicemail_count  INTEGER NOT NULL DEFAULT 0,
  no_answer_count  INTEGER NOT NULL DEFAULT 0,
  meetings_booked  INTEGER NOT NULL DEFAULT 0,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS prospecting_sessions_user_idx ON public.prospecting_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS prospecting_sessions_open_idx ON public.prospecting_sessions(organization_id, user_id) WHERE ended_at IS NULL;

ALTER TABLE public.prospecting_sessions ENABLE ROW LEVEL SECURITY;

-- A user manages only their own sessions, within an org they belong to.
CREATE POLICY prospecting_sessions_select ON public.prospecting_sessions FOR SELECT
  USING (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY prospecting_sessions_insert ON public.prospecting_sessions FOR INSERT
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
CREATE POLICY prospecting_sessions_update ON public.prospecting_sessions FOR UPDATE
  USING (user_id = auth.uid() AND public.is_org_member(organization_id))
  WITH CHECK (user_id = auth.uid() AND public.is_org_member(organization_id));
