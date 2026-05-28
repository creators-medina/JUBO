-- ─────────────────────────────────────────────────────────────────────────
-- Phase 26 — Twilio SMS runtime + unified conversation system.
--
-- conversation_threads groups SMS by participant phone (per org), links to a
-- record when matched. communication_logs gains thread_id so every SMS flows
-- through the unified communication layer. opt_out_suppressions enforces STOP.
-- Twilio creds reuse integration_connections (provider='twilio', config JSONB).
-- Inbound/status webhooks authenticate via Twilio signature + the admin client
-- (service-role), so no token-gated RPCs are needed here.
-- ─────────────────────────────────────────────────────────────────────────

-- ── conversation_threads ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_threads (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  primary_record_id UUID REFERENCES public.records(id) ON DELETE SET NULL,
  thread_type       TEXT NOT NULL DEFAULT 'sms',        -- sms | mixed | internal
  participant_phone TEXT NOT NULL,                      -- E.164: +12125551234
  participant_name  TEXT,
  last_message_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_direction    TEXT NOT NULL DEFAULT 'outbound',   -- inbound | outbound
  last_preview      TEXT,                               -- short preview of last message
  unread_count      INTEGER NOT NULL DEFAULT 0,
  archived_at       TIMESTAMPTZ,
  metadata          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One active thread per (org, phone). Partial unique so archived threads don't block re-creation.
CREATE UNIQUE INDEX IF NOT EXISTS conversation_threads_org_phone_uidx
  ON public.conversation_threads(organization_id, participant_phone) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS conversation_threads_org_last_idx
  ON public.conversation_threads(organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS conversation_threads_record_idx
  ON public.conversation_threads(primary_record_id) WHERE primary_record_id IS NOT NULL;

ALTER TABLE public.conversation_threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY conversation_threads_select ON public.conversation_threads FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY conversation_threads_insert ON public.conversation_threads FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY conversation_threads_update ON public.conversation_threads FOR UPDATE
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE TRIGGER conversation_threads_set_updated_at
  BEFORE UPDATE ON public.conversation_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── opt_out_suppressions (STOP compliance) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.opt_out_suppressions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone           TEXT NOT NULL,                        -- E.164
  reason          TEXT NOT NULL DEFAULT 'STOP',         -- STOP | STOPALL | CANCEL | END | QUIT | UNSUBSCRIBE | manual
  opted_out_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS opt_out_suppressions_org_phone_uidx
  ON public.opt_out_suppressions(organization_id, phone);

ALTER TABLE public.opt_out_suppressions ENABLE ROW LEVEL SECURITY;
CREATE POLICY opt_out_suppressions_select ON public.opt_out_suppressions FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY opt_out_suppressions_insert ON public.opt_out_suppressions FOR INSERT
  WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY opt_out_suppressions_delete ON public.opt_out_suppressions FOR DELETE
  USING (public.is_org_admin(organization_id));

-- ── communication_logs gains thread_id ─────────────────────────────────────
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES public.conversation_threads(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS communication_logs_thread_idx
  ON public.communication_logs(thread_id, occurred_at) WHERE thread_id IS NOT NULL;

-- Inbound idempotency: dedupe webhook replays by Twilio MessageSid per org.
CREATE UNIQUE INDEX IF NOT EXISTS communication_logs_twilio_sid_uidx
  ON public.communication_logs(organization_id, (metadata->>'twilio_message_sid'))
  WHERE metadata->>'twilio_message_sid' IS NOT NULL;
