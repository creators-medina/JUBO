-- ─────────────────────────────────────────────────────────────────────────
-- Phase 11: Operational Workspace System
--
-- Adds:
--   * notes — record-scoped operational notes (separate from activities)
--   * records.next_action / next_action_due_at / next_action_completed_at
--   * SECURITY DEFINER RPCs for note CRUD + next-action set/complete
--
-- Notes vs. activities: notes are first-class, editable, user-curated documents
-- attached to a record. They log themselves as 'note' activities for the
-- timeline but exist as their own table so users can edit/delete without
-- mutating activity history.
-- ─────────────────────────────────────────────────────────────────────────

-- ── notes ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id       UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  author_user_id  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  content         TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notes_record_idx ON public.notes(record_id, created_at DESC);
CREATE INDEX IF NOT EXISTS notes_org_idx    ON public.notes(organization_id);

CREATE TRIGGER notes_set_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY notes_select ON public.notes FOR SELECT
  USING (public.is_org_member(organization_id));
CREATE POLICY notes_update ON public.notes FOR UPDATE
  USING (public.is_org_member(organization_id) AND author_user_id = auth.uid());
CREATE POLICY notes_delete ON public.notes FOR DELETE
  USING (public.is_org_member(organization_id) AND author_user_id = auth.uid());

-- ── records.next_action columns ────────────────────────────────────────────
ALTER TABLE public.records
  ADD COLUMN IF NOT EXISTS next_action              TEXT,
  ADD COLUMN IF NOT EXISTS next_action_due_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_action_completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS records_next_action_due_idx
  ON public.records(organization_id, next_action_due_at)
  WHERE next_action_due_at IS NOT NULL AND next_action_completed_at IS NULL;

-- ── RPC: create_note ───────────────────────────────────────────────────────
-- Creates the note + logs a 'note' activity in one trip. Both rows share the
-- author_user_id so the timeline can show "Jane noted ..." cleanly.
CREATE OR REPLACE FUNCTION public.create_note(
  p_organization_id UUID,
  p_record_id       UUID,
  p_content         TEXT
) RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  INSERT INTO public.notes (organization_id, record_id, author_user_id, content)
  VALUES (p_organization_id, p_record_id, auth.uid(), COALESCE(p_content, ''))
  RETURNING id INTO v_id;

  INSERT INTO public.activities (organization_id, record_id, user_id, activity_type, content)
  VALUES (p_organization_id, p_record_id, auth.uid(), 'note', 'Added a note');

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.create_note(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_note(UUID, UUID, TEXT) TO authenticated;

-- ── RPC: update_note ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_note(
  p_id      UUID,
  p_content TEXT
) RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  UPDATE public.notes
  SET content = COALESCE(p_content, '')
  WHERE id = p_id AND author_user_id = auth.uid();

  IF NOT FOUND THEN RAISE EXCEPTION 'Note not found or not owned by caller'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.update_note(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_note(UUID, TEXT) TO authenticated;

-- ── RPC: delete_note ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_note(p_id UUID) RETURNS VOID AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  DELETE FROM public.notes WHERE id = p_id AND author_user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Note not found or not owned by caller'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.delete_note(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_note(UUID) TO authenticated;

-- ── RPC: set_next_action ───────────────────────────────────────────────────
-- Sets or clears the next action for a record. Pass NULL p_next_action to clear.
CREATE OR REPLACE FUNCTION public.set_next_action(
  p_record_id   UUID,
  p_next_action TEXT,
  p_due_at      TIMESTAMPTZ
) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id INTO v_org_id FROM public.records WHERE id = p_record_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  UPDATE public.records
  SET next_action              = p_next_action,
      next_action_due_at       = p_due_at,
      next_action_completed_at = NULL
  WHERE id = p_record_id;

  INSERT INTO public.activities (organization_id, record_id, user_id, activity_type, content)
  VALUES (v_org_id, p_record_id, auth.uid(), 'note',
    CASE
      WHEN p_next_action IS NULL THEN 'Cleared next action'
      ELSE 'Set next action: ' || p_next_action
    END);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.set_next_action(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_next_action(UUID, TEXT, TIMESTAMPTZ) TO authenticated;

-- ── RPC: complete_next_action ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.complete_next_action(p_record_id UUID) RETURNS VOID AS $$
DECLARE
  v_org_id UUID;
  v_action TEXT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT organization_id, next_action INTO v_org_id, v_action
  FROM public.records WHERE id = p_record_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Record not found'; END IF;
  IF NOT public.is_org_member(v_org_id) THEN
    RAISE EXCEPTION 'Not a member of this organization';
  END IF;

  UPDATE public.records
  SET next_action_completed_at = NOW()
  WHERE id = p_record_id AND next_action IS NOT NULL;

  INSERT INTO public.activities (organization_id, record_id, user_id, activity_type, content)
  VALUES (v_org_id, p_record_id, auth.uid(), 'note',
    'Completed next action' || COALESCE(': ' || v_action, ''));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.complete_next_action(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_next_action(UUID) TO authenticated;
