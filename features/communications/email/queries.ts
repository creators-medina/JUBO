// ─────────────────────────────────────────────────────────────────────────
// Phase B — Email config read. Returns the org's active Resend connection, or
// null when not configured / disabled. Called server-side only (config holds
// the secret key). Mirrors getTwilioConfig.
// ─────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from '@supabase/supabase-js'
import type { EmailConfig } from './types'

export async function getEmailConfig(
  client: SupabaseClient,
  organizationId: string,
): Promise<EmailConfig | null> {
  const { data } = await client
    .from('integration_connections')
    .select('config, status')
    .eq('organization_id', organizationId)
    .eq('provider', 'resend')
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  const cfg = (data as { config?: EmailConfig } | null)?.config
  if (!cfg || !cfg.api_key || !cfg.from_email) return null
  if (cfg.enabled === false) return null
  return cfg
}
