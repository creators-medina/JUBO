-- ============================================================
-- JUBO — Phase 2: Core Engine Database Architecture
-- Engine-first, org-isolated, mortgage-agnostic
-- ============================================================

-- ============================================================
-- EXTENSIONS
-- ============================================================
-- uuid-ossp is pre-installed on Supabase; gen_random_uuid() (pgcrypto/native) is used instead
-- to avoid search_path issues with gen_random_uuid()

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE public.org_role AS ENUM ('owner', 'admin', 'manager', 'member');

CREATE TYPE public.board_type AS ENUM ('crm', 'pipeline', 'operations', 'recruiting', 'custom');

CREATE TYPE public.record_type AS ENUM (
  'lead', 'contact', 'opportunity', 'loan', 'referral', 'task_item', 'operation', 'custom'
);

CREATE TYPE public.record_status AS ENUM ('active', 'won', 'lost', 'archived', 'on_hold');

CREATE TYPE public.record_priority AS ENUM ('none', 'low', 'medium', 'high', 'urgent');

CREATE TYPE public.field_type AS ENUM (
  'text', 'textarea', 'number', 'currency', 'boolean',
  'select', 'multiselect', 'date', 'datetime',
  'email', 'phone', 'relation', 'formula', 'rating', 'user', 'tags', 'url'
);

CREATE TYPE public.activity_type AS ENUM (
  'comment', 'note', 'call', 'email', 'sms', 'meeting',
  'status_change', 'field_change', 'assignment', 'creation',
  'automation', 'ai_insight', 'integration_event', 'custom'
);

CREATE TYPE public.movement_type AS ENUM (
  'stage_change', 'board_change', 'status_change', 'assignment_change', 'manual'
);

CREATE TYPE public.goal_type AS ENUM (
  'closings', 'volume', 'calls', 'appointments', 'revenue', 'leads', 'custom'
);

CREATE TYPE public.integration_status AS ENUM ('active', 'inactive', 'error', 'pending');

CREATE TYPE public.task_priority AS ENUM ('none', 'low', 'medium', 'high');

CREATE TYPE public.app_visibility AS ENUM ('all_members', 'admins_only', 'owner_only');

-- ============================================================
-- UTILITY: updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- PROFILES
-- Linked to auth.users — auto-created on signup
-- ============================================================

CREATE TABLE public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  first_name    TEXT,
  last_name     TEXT,
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on auth signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ORGANIZATIONS
-- Multi-tenant root — every record scoped to an org
-- ============================================================

CREATE TABLE public.organizations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug ON public.organizations(slug);
CREATE INDEX idx_organizations_owner ON public.organizations(owner_user_id);

CREATE TRIGGER set_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ORGANIZATION MEMBERS
-- ============================================================

CREATE TABLE public.organization_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            public.org_role NOT NULL DEFAULT 'member',
  invited_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);
CREATE INDEX idx_org_members_role ON public.organization_members(organization_id, role);

-- ============================================================
-- RLS HELPER FUNCTION
-- Central membership check — used by all org-scoped policies
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_org_member(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = org_id
    AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- BOARD ENGINE
-- Dynamic boards — no hardcoded board structures
-- ============================================================

CREATE TABLE public.boards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  icon            TEXT,
  color           TEXT,
  board_type      public.board_type NOT NULL DEFAULT 'custom',
  is_archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, slug)
);

CREATE INDEX idx_boards_org ON public.boards(organization_id);
CREATE INDEX idx_boards_type ON public.boards(organization_id, board_type);
CREATE INDEX idx_boards_archived ON public.boards(organization_id, is_archived);

CREATE TRIGGER set_boards_updated_at
  BEFORE UPDATE ON public.boards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- BOARD GROUPS
-- Stages, columns, swimlanes — generic and reorderable
-- ============================================================

CREATE TABLE public.board_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id    UUID NOT NULL REFERENCES public.boards(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  color       TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  group_type  TEXT,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_board_groups_board ON public.board_groups(board_id);
CREATE INDEX idx_board_groups_position ON public.board_groups(board_id, position);

CREATE TRIGGER set_board_groups_updated_at
  BEFORE UPDATE ON public.board_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- RECORD ENGINE
-- The most important table — generic cards/items
-- Supports: leads, loans, contacts, opportunities, etc.
-- ============================================================

CREATE TABLE public.records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board_id         UUID REFERENCES public.boards(id) ON DELETE SET NULL,
  group_id         UUID REFERENCES public.board_groups(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  record_type      public.record_type NOT NULL DEFAULT 'custom',
  status           public.record_status NOT NULL DEFAULT 'active',
  owner_user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  position         INTEGER NOT NULL DEFAULT 0,
  priority         public.record_priority NOT NULL DEFAULT 'none',
  value            NUMERIC(20, 2),
  health_score     INTEGER CHECK (health_score >= 0 AND health_score <= 100),
  is_archived      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_records_org ON public.records(organization_id);
CREATE INDEX idx_records_board ON public.records(board_id);
CREATE INDEX idx_records_group ON public.records(group_id);
CREATE INDEX idx_records_owner ON public.records(owner_user_id);
CREATE INDEX idx_records_assigned ON public.records(assigned_user_id);
CREATE INDEX idx_records_type ON public.records(organization_id, record_type);
CREATE INDEX idx_records_status ON public.records(organization_id, status);
CREATE INDEX idx_records_archived ON public.records(organization_id, is_archived);
CREATE INDEX idx_records_created ON public.records(organization_id, created_at DESC);
CREATE INDEX idx_records_position ON public.records(group_id, position);

CREATE TRIGGER set_records_updated_at
  BEFORE UPDATE ON public.records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- FIELD ENGINE
-- Dynamic custom field definitions
-- ============================================================

CREATE TABLE public.fields (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  board_id        UUID REFERENCES public.boards(id) ON DELETE CASCADE,
  entity_type     TEXT NOT NULL DEFAULT 'record',
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  field_type      public.field_type NOT NULL DEFAULT 'text',
  config          JSONB NOT NULL DEFAULT '{}',
  is_required     BOOLEAN NOT NULL DEFAULT FALSE,
  position        INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, board_id, slug)
);

CREATE INDEX idx_fields_org ON public.fields(organization_id);
CREATE INDEX idx_fields_board ON public.fields(board_id);
CREATE INDEX idx_fields_entity ON public.fields(organization_id, entity_type);

CREATE TRIGGER set_fields_updated_at
  BEFORE UPDATE ON public.fields
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- FIELD VALUES
-- Stores dynamic field data per record
-- Typed columns to avoid EAV string-only hell
-- ============================================================

CREATE TABLE public.field_values (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_id       UUID NOT NULL REFERENCES public.fields(id) ON DELETE CASCADE,
  record_id      UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  value_text     TEXT,
  value_number   NUMERIC(20, 4),
  value_boolean  BOOLEAN,
  value_date     TIMESTAMPTZ,
  value_json     JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(field_id, record_id)
);

CREATE INDEX idx_field_values_record ON public.field_values(record_id);
CREATE INDEX idx_field_values_field ON public.field_values(field_id);
CREATE INDEX idx_field_values_text ON public.field_values(field_id, value_text) WHERE value_text IS NOT NULL;
CREATE INDEX idx_field_values_number ON public.field_values(field_id, value_number) WHERE value_number IS NOT NULL;
CREATE INDEX idx_field_values_date ON public.field_values(field_id, value_date) WHERE value_date IS NOT NULL;
CREATE INDEX idx_field_values_json ON public.field_values USING GIN(value_json) WHERE value_json IS NOT NULL;

CREATE TRIGGER set_field_values_updated_at
  BEFORE UPDATE ON public.field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ACTIVITY ENGINE
-- Unified audit trail: comments, notes, calls, events
-- ============================================================

CREATE TABLE public.activities (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id       UUID REFERENCES public.records(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  activity_type   public.activity_type NOT NULL,
  content         TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_org ON public.activities(organization_id);
CREATE INDEX idx_activities_record ON public.activities(record_id);
CREATE INDEX idx_activities_user ON public.activities(user_id);
CREATE INDEX idx_activities_type ON public.activities(organization_id, activity_type);
CREATE INDEX idx_activities_created ON public.activities(record_id, created_at DESC);
CREATE INDEX idx_activities_metadata ON public.activities USING GIN(metadata);

-- ============================================================
-- TASK ENGINE
-- ============================================================

CREATE TABLE public.tasks (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id        UUID REFERENCES public.records(id) ON DELETE CASCADE,
  assigned_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title            TEXT NOT NULL,
  description      TEXT,
  due_date         TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  priority         public.task_priority NOT NULL DEFAULT 'none',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX idx_tasks_record ON public.tasks(record_id);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_user_id);
CREATE INDEX idx_tasks_due ON public.tasks(organization_id, due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_completed ON public.tasks(organization_id, completed_at) WHERE completed_at IS NOT NULL;

CREATE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- MOVEMENT / EVENT ENGINE
-- Immutable history of record movements — powers analytics
-- ============================================================

CREATE TABLE public.record_movements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  record_id       UUID NOT NULL REFERENCES public.records(id) ON DELETE CASCADE,
  from_group_id   UUID REFERENCES public.board_groups(id) ON DELETE SET NULL,
  to_group_id     UUID REFERENCES public.board_groups(id) ON DELETE SET NULL,
  moved_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  movement_type   public.movement_type NOT NULL DEFAULT 'stage_change',
  metadata        JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_movements_org ON public.record_movements(organization_id);
CREATE INDEX idx_movements_record ON public.record_movements(record_id);
CREATE INDEX idx_movements_created ON public.record_movements(record_id, created_at DESC);
CREATE INDEX idx_movements_to_group ON public.record_movements(to_group_id);
CREATE INDEX idx_movements_from_group ON public.record_movements(from_group_id);

-- ============================================================
-- GOAL ENGINE
-- ============================================================

CREATE TABLE public.goals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id   UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type       public.goal_type NOT NULL DEFAULT 'custom',
  label           TEXT,
  target_value    NUMERIC(20, 4) NOT NULL DEFAULT 0,
  current_value   NUMERIC(20, 4) NOT NULL DEFAULT 0,
  start_date      DATE NOT NULL,
  end_date        DATE NOT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_goals_org ON public.goals(organization_id);
CREATE INDEX idx_goals_owner ON public.goals(owner_user_id);
CREATE INDEX idx_goals_active ON public.goals(organization_id, is_active);
CREATE INDEX idx_goals_dates ON public.goals(organization_id, start_date, end_date);

CREATE TRIGGER set_goals_updated_at
  BEFORE UPDATE ON public.goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- INTEGRATION ENGINE
-- ============================================================

CREATE TABLE public.integrations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider        TEXT NOT NULL,
  status          public.integration_status NOT NULL DEFAULT 'inactive',
  config          JSONB NOT NULL DEFAULT '{}',
  connected_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, provider)
);

CREATE INDEX idx_integrations_org ON public.integrations(organization_id);
CREATE INDEX idx_integrations_provider ON public.integrations(provider);
CREATE INDEX idx_integrations_status ON public.integrations(organization_id, status);

CREATE TRIGGER set_integrations_updated_at
  BEFORE UPDATE ON public.integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- EMBEDDED APP ENGINE
-- ============================================================

CREATE TABLE public.embedded_apps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  url              TEXT NOT NULL,
  icon             TEXT,
  sidebar_position INTEGER NOT NULL DEFAULT 0,
  visibility       public.app_visibility NOT NULL DEFAULT 'all_members',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_embedded_apps_org ON public.embedded_apps(organization_id);
CREATE INDEX idx_embedded_apps_position ON public.embedded_apps(organization_id, sidebar_position);

CREATE TRIGGER set_embedded_apps_updated_at
  BEFORE UPDATE ON public.embedded_apps
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.record_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embedded_apps ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

-- Org members can view other member profiles
CREATE POLICY "profiles_select_org_members" ON public.profiles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om1
      JOIN public.organization_members om2
        ON om1.organization_id = om2.organization_id
      WHERE om1.user_id = auth.uid()
        AND om2.user_id = profiles.id
    )
  );

-- ---- ORGANIZATIONS ----
CREATE POLICY "orgs_select_member" ON public.organizations
  FOR SELECT USING (is_org_member(id));

CREATE POLICY "orgs_insert_authenticated" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "orgs_update_admin" ON public.organizations
  FOR UPDATE USING (is_org_admin(id));

-- ---- ORGANIZATION MEMBERS ----
CREATE POLICY "members_select_same_org" ON public.organization_members
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "members_insert_admin" ON public.organization_members
  FOR INSERT WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "members_update_admin" ON public.organization_members
  FOR UPDATE USING (is_org_admin(organization_id));

CREATE POLICY "members_delete_admin" ON public.organization_members
  FOR DELETE USING (is_org_admin(organization_id));

-- Allow users to insert themselves as owner when creating their own org
CREATE POLICY "members_insert_self_as_owner" ON public.organization_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ---- BOARDS ----
CREATE POLICY "boards_all_org_members" ON public.boards
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---- BOARD GROUPS ----
CREATE POLICY "board_groups_org_members" ON public.board_groups
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_groups.board_id
        AND is_org_member(b.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.boards b
      WHERE b.id = board_groups.board_id
        AND is_org_member(b.organization_id)
    )
  );

-- ---- RECORDS ----
CREATE POLICY "records_all_org_members" ON public.records
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---- FIELDS ----
CREATE POLICY "fields_all_org_members" ON public.fields
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---- FIELD VALUES ----
CREATE POLICY "field_values_org_members" ON public.field_values
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = field_values.record_id
        AND is_org_member(r.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.records r
      WHERE r.id = field_values.record_id
        AND is_org_member(r.organization_id)
    )
  );

-- ---- ACTIVITIES ----
CREATE POLICY "activities_all_org_members" ON public.activities
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---- TASKS ----
CREATE POLICY "tasks_all_org_members" ON public.tasks
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---- RECORD MOVEMENTS ----
CREATE POLICY "movements_select_org_members" ON public.record_movements
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "movements_insert_org_members" ON public.record_movements
  FOR INSERT WITH CHECK (is_org_member(organization_id));

-- Movements are immutable — no UPDATE or DELETE

-- ---- GOALS ----
CREATE POLICY "goals_all_org_members" ON public.goals
  FOR ALL USING (is_org_member(organization_id))
  WITH CHECK (is_org_member(organization_id));

-- ---- INTEGRATIONS ----
CREATE POLICY "integrations_select_members" ON public.integrations
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "integrations_write_admins" ON public.integrations
  FOR INSERT WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "integrations_update_admins" ON public.integrations
  FOR UPDATE USING (is_org_admin(organization_id));

CREATE POLICY "integrations_delete_admins" ON public.integrations
  FOR DELETE USING (is_org_admin(organization_id));

-- ---- EMBEDDED APPS ----
CREATE POLICY "embedded_apps_select_members" ON public.embedded_apps
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "embedded_apps_write_admins" ON public.embedded_apps
  FOR INSERT WITH CHECK (is_org_admin(organization_id));

CREATE POLICY "embedded_apps_update_admins" ON public.embedded_apps
  FOR UPDATE USING (is_org_admin(organization_id));

CREATE POLICY "embedded_apps_delete_admins" ON public.embedded_apps
  FOR DELETE USING (is_org_admin(organization_id));
