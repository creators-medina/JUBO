-- ─────────────────────────────────────────────────────────────────────────
-- Phase 21: Communication Timeline — manual call/email/SMS/meeting logging.
--
--   communication_logs — operational communication objects (not just notes).
--
-- This phase is MANUAL logging only (no Twilio/Resend/Gmail). The table is the
-- foundation future integrations write into. Each logged communication also
-- creates a normal `activities` row (so it shows in the unified timeline) — this
-- table is the structured store powering last-contact + contact-health + signals.
--
-- channel/direction/outcome are TEXT (project convention) — no new enums.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.communication_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id        UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  channel          TEXT NOT NULL,                 -- call | email | sms | meeting | internal
  direction        TEXT NOT NULL DEFAULT 'outbound', -- inbound | outbound | internal
  outcome          TEXT,                          -- connected|no_answer|voicemail|left_message|sent|received|completed|scheduled|cancelled|follow_up_needed
  subject          TEXT,
  summary          TEXT,
  body             TEXT,
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  follow_up_at     TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS communication_logs_org_idx        ON public.communication_logs(organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS communication_logs_record_idx     ON public.communication_logs(record_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS communication_logs_channel_idx    ON public.communication_logs(organization_id, channel);
CREATE INDEX IF NOT EXISTS communication_logs_outcome_idx    ON public.communication_logs(organization_id, outcome);
CREATE INDEX IF NOT EXISTS communication_logs_followup_idx   ON public.communication_logs(organization_id, follow_up_at) WHERE follow_up_at IS NOT NULL;

CREATE TRIGGER communication_logs_set_updated_at
  BEFORE UPDATE ON public.communication_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.communication_logs ENABLE ROW LEVEL SECURITY;

-- Members read + insert their org's logs; creator or admin may edit/delete.
CREATE POLICY communication_logs_select ON public.communication_logs FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY communication_logs_insert ON public.communication_logs FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY communication_logs_update ON public.communication_logs FOR UPDATE
  USING (created_by = auth.uid() OR public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY communication_logs_delete ON public.communication_logs FOR DELETE
  USING (created_by = auth.uid() OR public.is_org_admin(organization_id));
