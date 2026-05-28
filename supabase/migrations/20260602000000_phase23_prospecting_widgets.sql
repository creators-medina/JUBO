-- ─────────────────────────────────────────────────────────────────────────
-- Phase 23 — Prospecting widgets + rich outcomes + follow-up resolution.
--
--   1. Expand dashboard_widgets.widget_type CHECK for 5 prospecting widgets.
--   2. Add follow-up resolution columns to communication_logs.
--
-- No new tables — Phase 23 reuses communication_logs + prospecting_sessions.
-- ─────────────────────────────────────────────────────────────────────────

-- ── 1. Prospecting widget types ────────────────────────────────────────────
ALTER TABLE public.dashboard_widgets
  DROP CONSTRAINT IF EXISTS dashboard_widgets_widget_type_check;

ALTER TABLE public.dashboard_widgets
  ADD CONSTRAINT dashboard_widgets_widget_type_check
  CHECK (widget_type IN (
    'metric', 'list', 'board_summary', 'activity_feed', 'saved_view',
    'goal_progress', 'funnel_pace', 'gap_analysis',
    'today_summary', 'daily_actions_list',
    'prospecting_summary', 'connection_rate', 'hot_leads',
    'followups_due', 'active_call_session'
  ));

-- ── 2. Follow-up resolution ────────────────────────────────────────────────
-- A communication can carry a scheduled follow-up (follow_up_at). Until now it
-- had no explicit "done" flag, so the due-list could never be cleared. These
-- columns let a user (or a connected call) resolve a follow-up.
ALTER TABLE public.communication_logs
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial index: the followups-due query reads unresolved rows with a follow_up.
CREATE INDEX IF NOT EXISTS communication_logs_open_followup_idx
  ON public.communication_logs(organization_id, follow_up_at)
  WHERE follow_up_at IS NOT NULL AND resolved_at IS NULL;
