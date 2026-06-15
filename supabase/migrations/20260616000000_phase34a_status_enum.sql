-- ─────────────────────────────────────────────────────────────────────────
-- Phase 34A — Monday-style Status column.
--
-- Add a real `status` field type. Colored status was previously modeled as a
-- `select` whose options carry colors; `status` makes it a first-class type so
-- the cell renders the Monday-style picker + label editor and (Phase 34B) emits
-- status-change automation events. Existing `select` fields keep working.
--
-- Additive enum value only — safe, non-destructive. (Standalone migration: a
-- new enum value must be committed before it can be used.)
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'status';
