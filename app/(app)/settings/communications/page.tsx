import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CommunicationsSettingsClient, type RedactedTwilio } from '@/features/conversations/setup/CommunicationsSettingsClient'
import type { TwilioConfig } from '@/features/conversations/types'

export const dynamic = 'force-dynamic'

export default async function CommunicationsSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')

  const { data: conn } = await supabase
    .from('integration_connections').select('config, status')
    .eq('organization_id', membership.organization_id).eq('provider', 'twilio').maybeSingle()

  const config = (conn as { config: TwilioConfig } | null)?.config ?? null
  // Redact the auth token — secrets never reach the browser.
  const initial: RedactedTwilio | null = config ? {
    account_sid: config.account_sid ?? '',
    messaging_service_sid: config.messaging_service_sid ?? '',
    twilio_phone: config.twilio_phone ?? '',
    inbound_enabled: config.inbound_enabled !== false,
    outbound_enabled: config.outbound_enabled !== false,
    hasToken: !!config.auth_token,
  } : null

  return <CommunicationsSettingsClient initial={initial} connected={(conn as { status?: string } | null)?.status === 'active'} />
}
