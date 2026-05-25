// ─────────────────────────────────────────────────────────────────────────
// Phase 17 — Integration sync engine types.
//
// Generic inbound-sync layer. Providers normalize their own payloads into the
// shared NormalizedEvent; everything downstream (match/upsert/link/log) is
// provider-agnostic. No mortgage logic outside the normalizers + board routing.
// ─────────────────────────────────────────────────────────────────────────

export type ProviderId =
  | 'arive_zapier'
  | 'arive_api_future'
  | 'ghl_future'
  | 'loan_sifter_future'
  | 'custom_webhook'

export type ConnectionStatus = 'active' | 'paused' | 'revoked'

export type IntegrationEntityType = 'lead' | 'loan' | 'borrower' | 'contact'

/** Provider payload → normalized object. Kept deliberately loose/optional. */
export type NormalizedEvent = {
  sourceProvider: string
  externalId?: string
  externalEventId?: string
  eventType: string
  entityType: IntegrationEntityType
  person: {
    firstName?: string
    lastName?: string
    fullName?: string
    email?: string
    phone?: string
  }
  loan: {
    loanAmount?: number
    loanPurpose?: string
    occupancy?: string
    loanType?: string
    status?: string
    milestone?: string
    closingDate?: string
  }
  raw: unknown
}

/** Result of processing one inbound payload. */
export type ProcessResult = {
  ok: boolean
  duplicate?: boolean
  created?: boolean
  recordId?: string
  matchedOn?: string | null
  eventId?: string
  error?: string
  /** workflow event types emitted for this payload (executed by a future worker) */
  workflowEvents?: string[]
}

// ── Row types ─────────────────────────────────────────────────────────────

export type IntegrationConnectionRow = {
  id: string
  organization_id: string
  provider: ProviderId
  status: ConnectionStatus
  display_name: string
  config: Record<string, unknown>
  secret_token: string
  event_count: number
  last_sync_at: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type IntegrationEventRow = {
  id: string
  organization_id: string
  integration_connection_id: string | null
  provider: string
  external_event_id: string | null
  dedupe_key: string
  event_type: string | null
  payload: Record<string, unknown>
  normalized: Record<string, unknown>
  status: 'received' | 'processed' | 'failed' | 'duplicate'
  error_message: string | null
  record_id: string | null
  created_at: string
  processed_at: string | null
}

export type ExternalRecordLinkRow = {
  id: string
  organization_id: string
  provider: string
  external_id: string
  record_id: string
  entity_type: string | null
  created_at: string
  updated_at: string
}
