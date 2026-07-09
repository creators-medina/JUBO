-- ─────────────────────────────────────────────────────────────────────────
-- Phase E (perf) — index communication_logs by (organization_id, created_by).
--
-- Coaching + prospecting metrics repeatedly filter a user's OWN logs by
-- created_by within an org (e.g. talk-to / call counts). Existing indexes cover
-- (org, occurred_at) and (org, channel) but nothing on created_by, so those
-- per-user aggregates scan more than they should as an org's log volume grows.
-- occurred_at is trailing so the same index serves the common time-ordered read.
--
-- Additive + non-locking-relevant on the current tiny table; fully reversible
-- (DROP INDEX). Changes no data.
-- ─────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS communication_logs_created_by_idx
  ON public.communication_logs(organization_id, created_by, occurred_at DESC);
