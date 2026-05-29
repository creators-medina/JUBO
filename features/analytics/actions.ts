'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

async function userOrg() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: m } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!m) return null
  return { supabase, userId: user.id, orgId: (m as { organization_id: string }).organization_id }
}

/** Fire-and-forget product event. Best-effort — never throws, never blocks UX. */
export async function trackEvent(event: string, props: Record<string, unknown> = {}): Promise<void> {
  try {
    const ctx = await userOrg()
    if (!ctx) return
    await ctx.supabase.from('analytics_events').insert({
      organization_id: ctx.orgId, user_id: ctx.userId, event_name: event, props,
    })
  } catch { /* telemetry is best-effort */ }
}

export type FeedbackInput = { type?: string; title: string; description?: string; metadata?: Record<string, unknown> }

export async function submitFeedback(input: FeedbackInput): Promise<{ ok: true } | { error: string }> {
  const ctx = await userOrg()
  if (!ctx) return { error: 'not_authenticated' }
  const title = (input.title ?? '').trim()
  if (!title) return { error: 'empty' }
  const { error } = await ctx.supabase.from('feedback_submissions').insert({
    organization_id: ctx.orgId, user_id: ctx.userId,
    feedback_type: input.type ?? 'general', title,
    description: input.description?.trim() || null, metadata: input.metadata ?? {},
  })
  if (error) return { error: error.message }
  try {
    await ctx.supabase.from('analytics_events').insert({
      organization_id: ctx.orgId, user_id: ctx.userId, event_name: 'feedback_submitted', props: { type: input.type ?? 'general' },
    })
  } catch { /* best-effort */ }
  revalidatePath('/settings/analytics')
  return { ok: true }
}

export async function updateFeedbackStatus(id: string, status: string): Promise<{ ok: true } | { error: string }> {
  const ctx = await userOrg()
  if (!ctx) return { error: 'not_authenticated' }
  const { error } = await ctx.supabase.from('feedback_submissions').update({ status }).eq('id', id)
  if (error) return { error: error.message }
  revalidatePath('/settings/analytics')
  return { ok: true }
}
