-- ─────────────────────────────────────────────────────────────────────────
-- Phase 30A — Plan reveal one-time gate.
--
-- A nullable timestamp on onboarding_profiles tracks whether the LO has seen
-- the post-onboarding "Your Mortgage Operating System Is Ready" reveal.
-- NULL = not seen → app entry redirects to /onboarding/reveal once.
-- Stamped only when the LO clicks the primary CTA on the reveal page, so a
-- user who closes the tab before seeing it still sees it next login.
-- Re-opening via the command palette does NOT update the column.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.onboarding_profiles
  ADD COLUMN IF NOT EXISTS plan_revealed_at TIMESTAMPTZ NULL;
