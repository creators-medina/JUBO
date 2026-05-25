import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizardProvider } from '@/features/onboarding/state/OnboardingWizardProvider'
import { OnboardingFlow } from '@/features/onboarding/flows/OnboardingFlow'
import { ensureOnboardingProfile } from '@/features/onboarding/actions'
import { getOnboardingProfile, getIntegrationPreferences } from '@/features/onboarding/queries'
import type { OnboardingStepKey } from '@/features/onboarding/types'

export const dynamic = 'force-dynamic'

export default async function OnboardingSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ step?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  // No org yet — go create one first (then we route back here).
  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id
  await ensureOnboardingProfile(orgId)

  const [profile, integrationPrefs] = await Promise.all([
    getOnboardingProfile(orgId),
    getIntegrationPreferences(orgId),
  ])

  const { step } = await searchParams
  const initialStep: OnboardingStepKey =
    (step as OnboardingStepKey) ??
    (profile?.status === 'completed' ? 'done' : profile?.current_step ?? 'welcome')

  return (
    // fixed overlay escapes the centered (auth) layout so the wizard fills the viewport
    <div className="fixed inset-0 z-50 bg-background">
      <OnboardingWizardProvider
        organizationId={orgId}
        initialAnswers={profile?.answers ?? {}}
        initialFocus={profile?.focus_weights ?? {}}
        initialStep={initialStep}
      >
        <OnboardingFlow integrationPrefs={integrationPrefs} />
      </OnboardingWizardProvider>
    </div>
  )
}
