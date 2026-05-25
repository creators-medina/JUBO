// ─────────────────────────────────────────────────────────────────────────
// Integration catalog — pure data for the onboarding integration step.
//
// Phase 15 only captures INTENT (interested / connect-later). Live sync is a
// future phase. Each entry explains the connection model so the LO knows what
// to expect.
// ─────────────────────────────────────────────────────────────────────────

import type { IntegrationProvider } from '../types'

export type IntegrationSpec = {
  provider: IntegrationProvider
  name: string
  icon: string
  tagline: string
  connectionModel: string   // short explanation of how it'll connect
  available: boolean        // false → "coming soon"
}

export const INTEGRATION_CATALOG: IntegrationSpec[] = [
  { provider: 'arive',  name: 'Arive',  icon: 'Building2', tagline: 'Loan origination system',     connectionModel: 'API + webhook sync of pipeline files and statuses.', available: false },
  { provider: 'ghl',    name: 'GoHighLevel', icon: 'MessageSquare', tagline: 'Marketing & CRM',     connectionModel: 'Webhook sync of contacts and lead activity.',         available: false },
  { provider: 'zapier', name: 'Zapier', icon: 'Zap',      tagline: 'Connect 6,000+ apps',          connectionModel: 'Trigger Jubo events and push data via Zapier.',       available: false },
  { provider: 'los',    name: 'Other LOS', icon: 'Database', tagline: 'Encompass, Byte, etc.',     connectionModel: 'Import + API bridge (talk to us about your stack).',  available: false },
]
