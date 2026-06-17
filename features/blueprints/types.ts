// ─────────────────────────────────────────────────────────────────────────
// Process Blueprint — schema types + constants (Phase 38B).
//
// One JSON shape for both human-pasted and (future) AI-generated blueprints.
// 38B is READ-ONLY: validate + preview a dry-run apply plan. Nothing is created.
// ─────────────────────────────────────────────────────────────────────────

export const BLUEPRINT_VERSION = 1

export const SUPPORTED_BOARD_TYPES = ['crm', 'pipeline', 'operations', 'recruiting', 'custom'] as const

// Field types a blueprint may declare for fields[] (subset of FieldType that
// makes sense to author structurally). Checklist items use checklist[].
export const SUPPORTED_FIELD_TYPES = [
  'text', 'textarea', 'number', 'currency', 'boolean', 'select', 'status',
  'multiselect', 'date', 'datetime', 'email', 'phone', 'url', 'checklist',
] as const

// 36B lesson: name is NEVER bindable to a common field key.
export const NAME_ALIAS_KEYS = new Set(['name', 'full_name', 'borrower_name', 'client_name'])

export type BlueprintField = {
  key?: string
  name?: string
  type?: string
  position?: number
  common_field_key?: string | null
  options?: { label?: string; color?: string }[]
  is_default_status?: boolean
  visible_in_groups?: string[]
  required_in_groups?: string[]
}

export type BlueprintGroup = { key?: string; name?: string; color?: string }

export type BlueprintChecklistItem = { key?: string; name?: string; visible_in_groups?: string[] }

export type BlueprintBoard = {
  key?: string
  name?: string
  description?: string
  board_type?: string
  groups?: BlueprintGroup[]
  fields?: BlueprintField[]
  checklist?: BlueprintChecklistItem[]
}

export type Blueprint = {
  version?: number
  boards?: BlueprintBoard[]
  automations?: unknown[]
}

export type PreviewSeverity = 'info' | 'warning' | 'error' | 'deferred'
export type PreviewItemType =
  | 'board' | 'group' | 'field' | 'checklist' | 'automation' | 'common_field_key' | 'validation'

export type PreviewItem = {
  type: PreviewItemType
  label: string
  path: string
  message: string
  severity: PreviewSeverity
}

export type BlueprintPreviewPlan = {
  applyToken: string
  valid: boolean
  summary: {
    boards: number
    groups: number
    fields: number
    checklistFields: number
    automationsDeferred: number
    warnings: number
    blockingErrors: number
  }
  willCreate: PreviewItem[]
  warnings: PreviewItem[]
  blockingErrors: PreviewItem[]
  unsupportedDeferred: PreviewItem[]
  commonFieldBindings: PreviewItem[]
  resolvedBlueprint: unknown
}

export const SAMPLE_BLUEPRINT = `{
  "version": 1,
  "boards": [
    {
      "key": "lead_pipeline",
      "name": "Lead Pipeline",
      "description": "Main intake board",
      "board_type": "pipeline",
      "groups": [
        { "key": "lead_in", "name": "Lead In", "color": "#6366f1" },
        { "key": "pre_qual", "name": "Pre Qualification", "color": "#10b981" }
      ],
      "fields": [
        { "key": "status", "name": "Status", "type": "status", "is_default_status": true,
          "options": [ { "label": "Working", "color": "#f59e0b" }, { "label": "Done", "color": "#10b981" } ] },
        { "key": "email", "name": "Email", "type": "email", "common_field_key": "email" },
        { "key": "phone", "name": "Phone", "type": "phone", "common_field_key": "phone" },
        { "key": "credit", "name": "Credit Score", "type": "number", "visible_in_groups": ["pre_qual"] }
      ],
      "checklist": [
        { "key": "intro_call", "name": "Intro Call Within 30 Min", "visible_in_groups": ["lead_in"] },
        { "key": "docs", "name": "Docs Requested", "visible_in_groups": ["pre_qual"] }
      ]
    }
  ],
  "automations": [
    { "when": "status = Done in Lead In", "then": "move to Pre Qualification" }
  ]
}`
