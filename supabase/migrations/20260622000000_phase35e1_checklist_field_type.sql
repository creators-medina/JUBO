-- ─────────────────────────────────────────────────────────────────────────
-- Phase 35E.1 — True checklist field type.
--
-- A checklist item is now a real field (field_type='checklist') that behaves
-- like a checkbox: it stores value_boolean and is the SAME field value whether
-- toggled from the board grid or the record's Checklist tab. One source of
-- truth, two views. No new value storage.
--
-- field_requirements (Phase 35E) is intentionally preserved — its data stays
-- for future validation use; it simply no longer drives the Checklist UI.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TYPE public.field_type ADD VALUE IF NOT EXISTS 'checklist';
