export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type OrgRole = "owner" | "admin" | "manager" | "member";
export type BoardType = "crm" | "pipeline" | "operations" | "recruiting" | "custom";
export type RecordType = "lead" | "contact" | "opportunity" | "loan" | "referral" | "task_item" | "operation" | "custom";
export type RecordStatus = "active" | "won" | "lost" | "archived" | "on_hold";
export type RecordPriority = "none" | "low" | "medium" | "high" | "urgent";
export type FieldType = "text" | "textarea" | "number" | "currency" | "boolean" | "select" | "multiselect" | "date" | "datetime" | "email" | "phone" | "relation" | "formula" | "rating" | "user" | "tags" | "url";
export type ActivityType = "comment" | "note" | "call" | "email" | "sms" | "meeting" | "status_change" | "field_change" | "assignment" | "creation" | "automation" | "ai_insight" | "integration_event" | "custom";
export type MovementType = "stage_change" | "board_change" | "status_change" | "assignment_change" | "manual";
export type GoalType = "closings" | "volume" | "calls" | "appointments" | "revenue" | "leads" | "custom";
export type IntegrationStatus = "active" | "inactive" | "error" | "pending";
export type TaskPriority = "none" | "low" | "medium" | "high" | "urgent";
export type AppVisibility = "all_members" | "admins_only" | "owner_only";
export type WidgetType = "metric" | "list" | "board_summary" | "activity_feed" | "saved_view" | "goal_progress" | "funnel_pace" | "gap_analysis" | "today_summary" | "daily_actions_list";
export type DailyActionSource = "manual" | "task" | "goal_pacing" | "saved_view" | "record";
export type DailyProgressStatus = "on_pace" | "ahead" | "behind" | "unknown";
export type GoalTimeframe = "weekly" | "monthly" | "quarterly" | "yearly" | "custom";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          avatar_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          avatar_url?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["profiles"]["Insert"], "id">>;
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          owner_user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          owner_user_id: string;
        };
        Update: Partial<Pick<Database["public"]["Tables"]["organizations"]["Insert"], "name" | "slug">>;
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string;
          role: OrgRole;
          invited_by: string | null;
          joined_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id: string;
          role?: OrgRole;
          invited_by?: string | null;
          joined_at?: string | null;
        };
        Update: { role?: OrgRole; joined_at?: string | null };
      };
      boards: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          color: string | null;
          board_type: BoardType;
          is_archived: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
          color?: string | null;
          board_type?: BoardType;
          is_archived?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["boards"]["Insert"], "id" | "organization_id">>;
      };
      board_groups: {
        Row: {
          id: string;
          board_id: string;
          name: string;
          color: string | null;
          position: number;
          group_type: string | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          board_id: string;
          name: string;
          color?: string | null;
          position?: number;
          group_type?: string | null;
          is_archived?: boolean;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["board_groups"]["Insert"], "id" | "board_id">>;
      };
      records: {
        Row: {
          id: string;
          organization_id: string;
          board_id: string | null;
          group_id: string | null;
          title: string;
          record_type: RecordType;
          status: RecordStatus;
          owner_user_id: string | null;
          assigned_user_id: string | null;
          created_by: string | null;
          position: number;
          priority: RecordPriority;
          value: number | null;
          health_score: number | null;
          is_archived: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          board_id?: string | null;
          group_id?: string | null;
          title: string;
          record_type?: RecordType;
          status?: RecordStatus;
          owner_user_id?: string | null;
          assigned_user_id?: string | null;
          created_by?: string | null;
          position?: number;
          priority?: RecordPriority;
          value?: number | null;
          health_score?: number | null;
          is_archived?: boolean;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["records"]["Insert"], "id" | "organization_id">>;
      };
      fields: {
        Row: {
          id: string;
          organization_id: string;
          board_id: string | null;
          entity_type: string;
          name: string;
          slug: string;
          field_type: FieldType;
          config: Json;
          is_required: boolean;
          position: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          board_id?: string | null;
          entity_type?: string;
          name: string;
          slug: string;
          field_type?: FieldType;
          config?: Json;
          is_required?: boolean;
          position?: number;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["fields"]["Insert"], "id" | "organization_id">>;
      };
      field_values: {
        Row: {
          id: string;
          field_id: string;
          record_id: string;
          value_text: string | null;
          value_number: number | null;
          value_boolean: boolean | null;
          value_date: string | null;
          value_json: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          field_id: string;
          record_id: string;
          value_text?: string | null;
          value_number?: number | null;
          value_boolean?: boolean | null;
          value_date?: string | null;
          value_json?: Json | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["field_values"]["Insert"], "id" | "field_id" | "record_id">>;
      };
      activities: {
        Row: {
          id: string;
          organization_id: string;
          record_id: string | null;
          user_id: string | null;
          activity_type: ActivityType;
          content: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          record_id?: string | null;
          user_id?: string | null;
          activity_type: ActivityType;
          content?: string | null;
          metadata?: Json;
        };
        Update: never;
      };
      tasks: {
        Row: {
          id: string;
          organization_id: string;
          record_id: string | null;
          assigned_user_id: string | null;
          created_by: string | null;
          title: string;
          description: string | null;
          due_date: string | null;
          completed_at: string | null;
          priority: TaskPriority;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          record_id?: string | null;
          assigned_user_id?: string | null;
          created_by?: string | null;
          title: string;
          description?: string | null;
          due_date?: string | null;
          completed_at?: string | null;
          priority?: TaskPriority;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["tasks"]["Insert"], "id" | "organization_id">>;
      };
      record_movements: {
        Row: {
          id: string;
          organization_id: string;
          record_id: string;
          from_group_id: string | null;
          to_group_id: string | null;
          moved_by: string | null;
          movement_type: MovementType;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          record_id: string;
          from_group_id?: string | null;
          to_group_id?: string | null;
          moved_by?: string | null;
          movement_type?: MovementType;
          metadata?: Json;
        };
        Update: never;
      };
      goals: {
        Row: {
          id: string;
          organization_id: string;
          owner_user_id: string | null;
          goal_type: GoalType;
          label: string | null;
          target_value: number;
          current_value: number;
          start_date: string;
          end_date: string;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          owner_user_id?: string | null;
          goal_type?: GoalType;
          label?: string | null;
          target_value?: number;
          current_value?: number;
          start_date: string;
          end_date: string;
          is_active?: boolean;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["goals"]["Insert"], "id" | "organization_id">>;
      };
      integrations: {
        Row: {
          id: string;
          organization_id: string;
          provider: string;
          status: IntegrationStatus;
          config: Json;
          connected_by: string | null;
          connected_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          provider: string;
          status?: IntegrationStatus;
          config?: Json;
          connected_by?: string | null;
          connected_at?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["integrations"]["Insert"], "id" | "organization_id" | "provider">>;
      };
      embedded_apps: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          url: string;
          icon: string | null;
          sidebar_position: number;
          visibility: AppVisibility;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          url: string;
          icon?: string | null;
          sidebar_position?: number;
          visibility?: AppVisibility;
          is_active?: boolean;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["embedded_apps"]["Insert"], "id" | "organization_id">>;
      };
      dashboards: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          slug: string;
          description: string | null;
          icon: string | null;
          color: string | null;
          is_default: boolean;
          is_archived: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          slug: string;
          description?: string | null;
          icon?: string | null;
          color?: string | null;
          is_default?: boolean;
          is_archived?: boolean;
          created_by?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["dashboards"]["Insert"], "id" | "organization_id">>;
      };
      dashboard_widgets: {
        Row: {
          id: string;
          dashboard_id: string;
          widget_type: WidgetType;
          title: string;
          position_x: number;
          position_y: number;
          width: number;
          height: number;
          config: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          dashboard_id: string;
          widget_type: WidgetType;
          title: string;
          position_x?: number;
          position_y?: number;
          width?: number;
          height?: number;
          config?: Json;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["dashboard_widgets"]["Insert"], "id" | "dashboard_id">>;
      };
      saved_views: {
        Row: {
          id: string;
          organization_id: string;
          board_id: string | null;
          name: string;
          filters: Json;
          sort: Json;
          visible_fields: Json;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          board_id?: string | null;
          name: string;
          filters?: Json;
          sort?: Json;
          visible_fields?: Json;
          created_by?: string | null;
        };
        Update: Partial<Omit<Database["public"]["Tables"]["saved_views"]["Insert"], "id" | "organization_id">>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { org_id: string };
        Returns: boolean;
      };
      is_org_admin: {
        Args: { org_id: string };
        Returns: boolean;
      };
      create_organization_with_owner: {
        Args: { org_name: string; org_slug: string };
        Returns: string;
      };
      move_record: {
        Args: { p_record_id: string; p_to_group_id: string; p_user_id: string };
        Returns: void;
      };
    };
    Enums: {
      org_role: OrgRole;
      board_type: BoardType;
      record_type: RecordType;
      record_status: RecordStatus;
      record_priority: RecordPriority;
      field_type: FieldType;
      activity_type: ActivityType;
      movement_type: MovementType;
      goal_type: GoalType;
      integration_status: IntegrationStatus;
      task_priority: TaskPriority;
      app_visibility: AppVisibility;
    };
  };
}
