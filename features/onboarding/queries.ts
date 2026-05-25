import { createClient } from '@/lib/supabase/server'
import type {
  OnboardingProfileRow,
  SetupChecklistItemRow,
  IntegrationPreferenceRow,
  OnboardingUploadRow,
} from './types'

export async function getOnboardingProfile(organizationId: string): Promise<OnboardingProfileRow | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('onboarding_profiles')
    .select('*')
    .eq('organization_id', organizationId)
    .maybeSingle()
  return (data as OnboardingProfileRow | null) ?? null
}

export async function getSetupChecklist(organizationId: string): Promise<SetupChecklistItemRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('setup_checklist_items')
    .select('*')
    .eq('organization_id', organizationId)
    .order('position', { ascending: true })
  return (data as SetupChecklistItemRow[] | null) ?? []
}

export async function getIntegrationPreferences(organizationId: string): Promise<IntegrationPreferenceRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('integration_preferences')
    .select('*')
    .eq('organization_id', organizationId)
  return (data as IntegrationPreferenceRow[] | null) ?? []
}

export async function getOnboardingUploads(organizationId: string): Promise<OnboardingUploadRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('onboarding_uploads')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  return (data as OnboardingUploadRow[] | null) ?? []
}
