import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CommunicationsSettingsClient, type RedactedTwilio } from '@/features/conversations/setup/CommunicationsSettingsClient'
import { EmailSettingsClient, type RedactedEmail } from '@/features/communications/email/EmailSettingsClient'
import type { TwilioConfig } from '@/features/conversations/types'
import type { EmailConfig } from '@/features/communications/email/types'

export const dynamic = 'force-dynamic'

export default async function CommunicationsSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')

  const [twilioRes, emailRes] = await Promise.all([
    supabase.from('integration_connections').select('config, status')
      .eq('organization_id', membership.organization_id).eq('provider', 'twilio').maybeSingle(),
    supabase.from('integration_connections').select('config, status')
      .eq('organization_id', membership.organization_id).eq('provider', 'resend').maybeSingle(),
  ])

  const config = (twilioRes.data as { config: TwilioConfig } | null)?.config ?? null
  // Redact the auth token — secrets never reach the browser.
  const initial: RedactedTwilio | null = config ? {
    account_sid: config.account_sid ?? '',
    messaging_service_sid: config.messaging_service_sid ?? '',
    twilio_phone: config.twilio_phone ?? '',
    inbound_enabled: config.inbound_enabled !== false,
    outbound_enabled: config.outbound_enabled !== false,
    hasToken: !!config.auth_token,
  } : null

  const emailCfg = (emailRes.data as { config: EmailConfig } | null)?.config ?? null
  // Redact the API key.
  const emailInitial: RedactedEmail | null = emailCfg ? {
    from_email: emailCfg.from_email ?? '',
    from_name: emailCfg.from_name ?? '',
    enabled: emailCfg.enabled !== false,
    hasKey: !!emailCfg.api_key,
  } : null

  return (
    <>
      <CommunicationsSettingsClient initial={initial} connected={(twilioRes.data as { status?: string } | null)?.status === 'active'} />
      <EmailSettingsClient initial={emailInitial} connected={(emailRes.data as { status?: string } | null)?.status === 'active'} />
    </>
  )
}
