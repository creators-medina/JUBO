// ─────────────────────────────────────────────────────────────────────────
// Provider registry. Each provider supplies a normalizer + display metadata.
// Future providers (Arive API, GHL, LoanSifter) slot in here without touching
// the webhook route or the processor.
// ─────────────────────────────────────────────────────────────────────────

import { normalizeArive } from './arive'
import type { NormalizedEvent, ProviderId } from '../types'

export type ProviderDef = {
  id: ProviderId
  label: string
  available: boolean
  description: string
  normalize: (payload: unknown) => NormalizedEvent
}

export const PROVIDERS: Record<string, ProviderDef> = {
  arive_zapier: {
    id: 'arive_zapier',
    label: 'Arive (via Zapier)',
    available: true,
    description: 'Send Arive loan & borrower events into Jubo through a Zapier webhook.',
    normalize: normalizeArive,
  },
  custom_webhook: {
    id: 'custom_webhook',
    label: 'Custom Webhook',
    available: true,
    description: 'Generic inbound webhook — flexible normalization for any JSON source.',
    normalize: normalizeArive, // generic normalizer reads common key shapes
  },
}

export function providerDef(provider: string): ProviderDef | undefined {
  return PROVIDERS[provider]
}
