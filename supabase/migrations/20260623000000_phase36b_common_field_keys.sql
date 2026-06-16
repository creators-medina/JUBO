-- ─────────────────────────────────────────────────────────────────────────
-- Phase 36B — Common Field Registry + field keys (identity only).
--
-- A bridge layer that marks which fields across boards represent the same
-- logical data (Person / Loan / etc.). NO value movement happens here — that's
-- Phase 36C. This phase only adds identity: a per-org registry of keys and a
-- nullable FK from fields → keys. field_values are never touched.
-- ─────────────────────────────────────────────────────────────────────────

-- ── Registry table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.common_field_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,
  label           TEXT NOT NULL,
  data_type       TEXT NOT NULL,
  scope           TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, key),
  -- Status is intentionally excluded from the registry in 36B (Decision 5).
  CONSTRAINT cfk_data_type_chk CHECK (data_type IN ('text','email','phone','currency','number','date','select','boolean','url')),
  CONSTRAINT cfk_scope_chk CHECK (scope IN ('person','loan','organization','team','custom'))
);

CREATE INDEX IF NOT EXISTS idx_cfk_org ON public.common_field_keys(organization_id);

ALTER TABLE public.common_field_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfk_all_org_members" ON public.common_field_keys
  FOR ALL USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

-- ── Field → key link (Decision 1: UUID FK only, no text key on fields) ───────
ALTER TABLE public.fields
  ADD COLUMN IF NOT EXISTS common_field_key_id UUID REFERENCES public.common_field_keys(id) ON DELETE SET NULL;

-- Decision 6: at most one field per board may claim a given key.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_fields_common_key_per_board
  ON public.fields(board_id, common_field_key_id) WHERE common_field_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fields_common_key ON public.fields(common_field_key_id);

-- ── Backfill / import audit log (inspectable; persistent table) ──────────────
CREATE TABLE IF NOT EXISTS public.common_field_backfill_audit (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id        UUID,
  organization_id UUID,
  board_id        UUID,
  field_name      TEXT,
  field_type      TEXT,
  matched_key     TEXT,
  reason          TEXT NOT NULL,
  source          TEXT NOT NULL DEFAULT 'backfill',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(field_id, source)
);
ALTER TABLE public.common_field_backfill_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cfba_all_org_members" ON public.common_field_backfill_audit
  FOR ALL USING (organization_id IS NULL OR public.is_org_member(organization_id))
  WITH CHECK (organization_id IS NULL OR public.is_org_member(organization_id));

-- ── Idempotent seeding of default keys for one org ──────────────────────────
CREATE OR REPLACE FUNCTION public.seed_common_field_keys(p_org_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.common_field_keys (organization_id, key, label, data_type, scope) VALUES
    (p_org_id, 'name',             'Name',             'text',     'person'),
    (p_org_id, 'email',            'Email',            'email',    'person'),
    (p_org_id, 'phone',            'Phone',            'phone',    'person'),
    (p_org_id, 'loan_amount',      'Loan Amount',      'currency', 'loan'),
    (p_org_id, 'property_address', 'Property Address', 'text',     'loan'),
    (p_org_id, 'loan_type',        'Loan Type',        'select',   'loan'),
    (p_org_id, 'lead_source',      'Lead Source',      'select',   'loan'),
    (p_org_id, 'assigned_lo',      'Assigned LO',      'text',     'loan')
  ON CONFLICT (organization_id, key) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE ALL ON FUNCTION public.seed_common_field_keys(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_common_field_keys(UUID) TO authenticated, service_role;

-- ── New-org seeding: wire into the org-creation RPC (Decision 2) ─────────────
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  org_name TEXT,
  org_slug TEXT
)
RETURNS UUID AS $$
DECLARE
  v_user_id UUID;
  v_org_id  UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO public.organizations (name, slug, owner_user_id)
  VALUES (org_name, org_slug, v_user_id)
  RETURNING id INTO v_org_id;

  INSERT INTO public.organization_members (organization_id, user_id, role, joined_at)
  VALUES (v_org_id, v_user_id, 'owner', NOW());

  -- Phase 36B — every new org gets the default common field registry.
  PERFORM public.seed_common_field_keys(v_org_id);

  RETURN v_org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
REVOKE ALL ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;

-- ── Seed every EXISTING org (idempotent) ────────────────────────────────────
DO $$
DECLARE o RECORD;
BEGIN
  FOR o IN SELECT id FROM public.organizations LOOP
    PERFORM public.seed_common_field_keys(o.id);
  END LOOP;
END $$;

-- ── Backfill existing fields via explicit allowlist + audit (Decision 3) ─────
-- Exact, case-insensitive, trimmed name match → key; type-compatible per the
-- matrix (Decision 4); per-board duplicate guard (Decision 6); checklist + the
-- default workflow status field are never eligible. Idempotent: only NULL-keyed
-- fields are evaluated, audit rows are unique per (field_id, source).
DO $$
DECLARE
  r           RECORD;
  v_key       TEXT;
  v_key_id    UUID;
  v_data_type TEXT;
  v_matched   TEXT;
  v_reason    TEXT;
BEGIN
  FOR r IN
    SELECT f.id, f.organization_id, f.board_id, f.name, f.field_type, f.is_default_status, f.common_field_key_id
    FROM public.fields f
    ORDER BY f.board_id, f.created_at, f.id   -- deterministic for the dup guard
  LOOP
    IF r.common_field_key_id IS NOT NULL THEN CONTINUE; END IF;  -- already keyed

    v_matched := NULL; v_key_id := NULL;

    IF r.field_type = 'checklist' THEN
      v_reason := 'excluded: checklist';
    ELSIF r.is_default_status THEN
      v_reason := 'excluded: default workflow status';
    ELSE
      v_key := CASE lower(trim(r.name))
        WHEN 'email' THEN 'email'
        WHEN 'e-mail' THEN 'email'
        WHEN 'phone' THEN 'phone'
        WHEN 'mobile_phone' THEN 'phone'
        WHEN 'borrower_phone' THEN 'phone'
        WHEN 'cell' THEN 'phone'
        WHEN 'name' THEN 'name'
        WHEN 'full_name' THEN 'name'
        WHEN 'borrower_name' THEN 'name'
        WHEN 'loan_amount' THEN 'loan_amount'
        WHEN 'amount' THEN 'loan_amount'
        WHEN 'preapproved_amount' THEN 'loan_amount'
        WHEN 'property_address' THEN 'property_address'
        WHEN 'address' THEN 'property_address'
        WHEN 'loan_type' THEN 'loan_type'
        WHEN 'lead_source' THEN 'lead_source'
        WHEN 'assigned_lo' THEN 'assigned_lo'
        WHEN 'loan_officer' THEN 'assigned_lo'
        ELSE NULL
      END;

      IF v_key IS NULL THEN
        v_reason := 'no allowlist match';
      ELSE
        SELECT id, data_type INTO v_key_id, v_data_type
        FROM public.common_field_keys
        WHERE organization_id = r.organization_id AND key = v_key;

        IF v_key_id IS NULL THEN
          v_reason := 'no registry key';
        ELSIF NOT (r.field_type::text = v_data_type
                   OR (r.field_type::text = 'text' AND v_data_type IN ('text','email','phone','url'))) THEN
          v_reason := 'type incompatible: ' || r.field_type::text || ' vs ' || v_data_type;
          v_key_id := NULL;
        ELSIF EXISTS (
          SELECT 1 FROM public.fields f2
          WHERE f2.board_id = r.board_id AND f2.common_field_key_id = v_key_id
        ) THEN
          v_reason := 'skipped: duplicate key on board';
          v_key_id := NULL;
        ELSE
          UPDATE public.fields SET common_field_key_id = v_key_id WHERE id = r.id;
          v_matched := v_key;
          v_reason := 'exact allowlist match';
        END IF;
      END IF;
    END IF;

    INSERT INTO public.common_field_backfill_audit
      (field_id, organization_id, board_id, field_name, field_type, matched_key, reason, source)
    VALUES
      (r.id, r.organization_id, r.board_id, r.name, r.field_type::text, v_matched, v_reason, 'backfill')
    ON CONFLICT (field_id, source) DO NOTHING;
  END LOOP;
END $$;
