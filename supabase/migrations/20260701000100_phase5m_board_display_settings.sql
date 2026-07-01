-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5M — boards.display_settings (per-board Top Phase Summary display prefs)
--
-- Stores which summary items show in the board header (money / contacts /
-- leading stage / role chips / stage values). Additive, non-null with a '{}'
-- default so existing boards behave exactly as before (all items shown).
-- Presentation only — never touches records, values, stages, or calculations.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS display_settings JSONB NOT NULL DEFAULT '{}'::jsonb;
