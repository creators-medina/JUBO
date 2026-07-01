-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5J — stage-level ROLE label + GUIDANCE NOTE
--
-- Adds two optional, nullable presentation columns to board_groups:
--   • role_label    — a short role/owner hint per stage (e.g. "LO", "LP1").
--   • guidance_note — quiet coaching/context text for whoever works the stage.
--
-- Purely additive metadata on the stage. Does NOT touch records, checklist
-- fields/values, field_group_visibility, or workflows; has no effect on
-- checklist progress (guidance is never a checklist item). Safe for every org —
-- existing groups keep NULL (nothing renders) until an admin sets a value.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.board_groups
  ADD COLUMN IF NOT EXISTS role_label    TEXT,
  ADD COLUMN IF NOT EXISTS guidance_note TEXT;
