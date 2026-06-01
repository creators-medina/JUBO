'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { provisionWorkspace, type ProvisionResult } from './generators/provision'
import { regenerateDailyActions } from '@/features/daily-actions/actions'
import type {
  OnboardingAnswers,
  FocusWeights,
  OnboardingStepKey,
  IntegrationProvider,
  IntegrationStatus,
  OnboardingUploadKind,
} from './types'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

/** Ensure a profile row exists for the org (called when the wizard mounts). */
export async function ensureOnboardingProfile(organizationId: string): Promise<void> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from('onboarding_profiles')
    .upsert(
      { organization_id: organizationId, created_by: user.id },
      { onConflict: 'organization_id', ignoreDuplicates: true },
    )
  if (error) throw new Error(error.message)
}

/** Persist wizard progress — merges answer/focus patches into the profile. */
export async function saveOnboardingProgress(
  organizationId: string,
  patch: {
    answers?: Partial<OnboardingAnswers>
    focus_weights?: FocusWeights
    current_step?: OnboardingStepKey
  },
): Promise<void> {
  const { supabase, user } = await requireUser()

  const { data: existing } = await supabase
    .from('onboarding_profiles')
    .select('answers, focus_weights')
    .eq('organization_id', organizationId)
    .maybeSingle()

  const mergedAnswers = { ...(existing?.answers ?? {}), ...(patch.answers ?? {}) }
  const mergedFocus = { ...(existing?.focus_weights ?? {}), ...(patch.focus_weights ?? {}) }

  const { error } = await supabase
    .from('onboarding_profiles')
    .upsert(
      {
        organization_id: organizationId,
        created_by: user.id,
        answers: mergedAnswers,
        focus_weights: mergedFocus,
        ...(patch.current_step ? { current_step: patch.current_step } : {}),
      },
      { onConflict: 'organization_id' },
    )
  if (error) throw new Error(error.message)
}

/**
 * Finalize onboarding: provision the workspace (idempotent), generate the
 * Today cockpit, and mark the profile completed. Returns provisioning counts.
 */
export async function completeOnboarding(organizationId: string): Promise<ProvisionResult> {
  const { supabase, user } = await requireUser()

  const { data: profile } = await supabase
    .from('onboarding_profiles')
    .select('answers, focus_weights, provisioned')
    .eq('organization_id', organizationId)
    .maybeSingle()

  const answers = (profile?.answers ?? {}) as OnboardingAnswers
  const weights = (profile?.focus_weights ?? {}) as FocusWeights

  let result: ProvisionResult = {
    boards: 0, groups: 0, fields: 0, dashboards: 0, widgets: 0,
    goalCreated: false, workflowsEnabled: 0, checklistItems: 0,
    createdBoards: [],
  }

  // Guard against double-provisioning if the LO re-runs the final step.
  if (!profile?.provisioned) {
    result = await provisionWorkspace(organizationId, answers, weights)
  }

  // Populate the Today cockpit (best-effort).
  try {
    await regenerateDailyActions()
  } catch (err) {
    console.warn('[onboarding] daily action generation failed:', err)
  }

  // Seed the org coaching baselines from captured answers (best-effort). The
  // coaching engine falls back to DEFAULT_BASELINES if no row exists, so this
  // only persists what the LO told us (loan size, inferred commission).
  try {
    const { data: existing } = await supabase
      .from('coaching_assumptions').select('id').eq('organization_id', organizationId).is('user_id', null).maybeSingle()
    if (!existing) {
      const avgLoan = typeof answers.average_loan_size === 'number' ? answers.average_loan_size : null
      const avgComm = (answers.target_income && answers.target_closings && answers.target_closings > 0)
        ? Math.round(answers.target_income / answers.target_closings) : null
      await supabase.from('coaching_assumptions').insert({
        organization_id: organizationId,
        user_id: null,
        ...(avgLoan != null ? { avg_loan_size: avgLoan } : {}),
        ...(avgComm != null ? { avg_commission: avgComm } : {}),
        created_by: user.id,
      })
    }
  } catch (err) {
    console.warn('[onboarding] coaching assumptions seed failed:', err)
  }

  await supabase
    .from('onboarding_profiles')
    .update({ status: 'completed', current_step: 'done', completed_at: new Date().toISOString() })
    .eq('organization_id', organizationId)

  revalidatePath('/dashboard')
  revalidatePath('/today')
  revalidatePath('/boards')

  // Product analytics (best-effort): mark onboarding as completed.
  try {
    await supabase.from('analytics_events').insert({
      organization_id: organizationId, user_id: user.id, event_name: 'onboarding_completed',
      props: { boards: result.boards, dashboards: result.dashboards, widgets: result.widgets },
    })
  } catch { /* telemetry is best-effort */ }

  return result
}

// ── Plan reveal (Phase 30A) ─────────────────────────────────────────────────
/**
 * Stamp `plan_revealed_at` so the post-onboarding reveal only appears once. Called
 * from the reveal page's primary CTA. Re-opening via command palette must NOT
 * call this — the column never moves backwards.
 */
export async function markPlanRevealed(organizationId: string): Promise<void> {
  const { supabase } = await requireUser()
  await supabase
    .from('onboarding_profiles')
    .update({ plan_revealed_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .is('plan_revealed_at', null)
  revalidatePath('/today')
}

// ── Setup checklist ──────────────────────────────────────────────────────────
export async function setChecklistItemCompleted(itemId: string, completed: boolean): Promise<void> {
  const { supabase } = await requireUser()
  const { error } = await supabase
    .from('setup_checklist_items')
    .update({ completed, completed_at: completed ? new Date().toISOString() : null })
    .eq('id', itemId)
  if (error) throw new Error(error.message)
  revalidatePath('/today')
  revalidatePath('/dashboard')
}

// ── Integration preferences ───────────────────────────────────────────────────
export async function setIntegrationPreference(
  organizationId: string,
  provider: IntegrationProvider,
  status: IntegrationStatus,
  note?: string,
): Promise<void> {
  const { supabase, user } = await requireUser()
  const { error } = await supabase
    .from('integration_preferences')
    .upsert(
      { organization_id: organizationId, provider, status, note: note ?? null, created_by: user.id },
      { onConflict: 'organization_id,provider' },
    )
  if (error) throw new Error(error.message)
  revalidatePath('/integrations')
}

// ── Import upload metadata + status updates (Phase 30B) ────────────────────────
/**
 * Record an onboarding-time file upload. Returns the audit row id so the wizard
 * can update its status after the post-provision import pipeline runs.
 *
 * Phase 30B: the file BLOB is held in OnboardingWizardProvider state until
 * GeneratingStep drives the import — this action persists only the metadata.
 */
export async function recordOnboardingUpload(
  organizationId: string,
  upload: { kind: OnboardingUploadKind; file_name: string; mime_type?: string; size_bytes?: number; row_count?: number },
): Promise<string> {
  const { supabase, user } = await requireUser()
  const { data, error } = await supabase
    .from('onboarding_uploads')
    .insert({
      organization_id: organizationId,
      kind: upload.kind,
      file_name: upload.file_name,
      mime_type: upload.mime_type ?? null,
      size_bytes: upload.size_bytes ?? null,
      row_count: upload.row_count ?? null,
      status: 'pending_mapping',
      created_by: user.id,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Could not record upload')
  return data.id as string
}

/** Flip an onboarding upload's status after the post-provision import runs. */
export async function updateOnboardingUploadStatus(
  uploadId: string,
  status: 'completed' | 'failed' | 'needs_review',
  fields: { row_count?: number } = {},
): Promise<void> {
  const { supabase } = await requireUser()
  const update: Record<string, unknown> = { status }
  if (fields.row_count != null) update.row_count = fields.row_count
  await supabase.from('onboarding_uploads').update(update).eq('id', uploadId)
}

/** Mark a checklist item complete by item_key (org-scoped) — used post-import
 *  so the LO doesn't still see "Import past clients" after we did it for them. */
export async function completeChecklistItemByKey(organizationId: string, itemKey: string): Promise<void> {
  const { supabase } = await requireUser()
  await supabase
    .from('setup_checklist_items')
    .update({ completed: true, completed_at: new Date().toISOString() })
    .eq('organization_id', organizationId)
    .eq('item_key', itemKey)
    .eq('completed', false)
  revalidatePath('/today')
}
