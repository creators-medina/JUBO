import type { OrgRole } from "./database";

export type { OrgRole };

export interface Organization {
  id: string;
  name: string;
  slug: string;
  owner_user_id: string;
  created_at: string;
  updated_at: string;
}

export interface OrganizationMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  invited_by: string | null;
  joined_at: string | null;
  created_at: string;
}
