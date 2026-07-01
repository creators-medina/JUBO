-- ─────────────────────────────────────────────────────────────────────────
-- Phase 5L — boards.position (sidebar drag-to-reorder)
--
-- Adds a per-board sort position so the left sidebar can be reordered and the
-- order persists. Additive and safe: existing rows are backfilled from the
-- current display order (created_at, per org) so nothing visibly moves until a
-- user drags. Presentation/ordering only — no records, groups, or board content
-- are touched.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.boards
  ADD COLUMN IF NOT EXISTS position INTEGER NOT NULL DEFAULT 0;

-- Backfill: keep today's order (created_at ascending) within each org.
WITH ordered AS (
  SELECT id, (ROW_NUMBER() OVER (PARTITION BY organization_id ORDER BY created_at ASC) - 1) AS rn
  FROM public.boards
)
UPDATE public.boards b
SET position = o.rn
FROM ordered o
WHERE b.id = o.id;

CREATE INDEX IF NOT EXISTS idx_boards_position ON public.boards(organization_id, position);
