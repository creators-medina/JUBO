'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { processIntegrationPayload } from './sync/process'
import type { ConnectionStatus, ProcessResult, ProviderId } from './types'

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  return { supabase, user }
}

function newToken(): string {
  return (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, '')
}

/** Create an integration connection. Returns id + secret token (shown to admin). */
export async function createConnection(input: {
  organizationId: string
  provider: ProviderId
  displayName: string
}): Promise<{ id: string; secret_token: string }> {
  const { supabase, user } = await requireUser()
  const { data, error } = await supabase
    .from('integration_connections')
    .insert({
      organization_id: input.organizationId,
      provider: input.provider,
      display_name: input.displayName,
      created_by: user.id,
    })
    .select('id, secret_token')
    .single()
  if (error || !data) throw new Error(error?.message ?? 'Failed to create connection')
  revalidatePath('/settings/integrations')
  return { id: data.id, secret_token: data.secret_token }
}

export async function setConnectionStatus(connectionId: string, status: ConnectionStatus): Promise<void> {
  const { supabase } = await requireUser()
  const { error } = await supabase.from('integration_connections').update({ status }).eq('id', connectionId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/integrations')
}

export async function rotateToken(connectionId: string): Promise<string> {
  const { supabase } = await requireUser()
  const token = newToken()
  const { error } = await supabase.from('integration_connections').update({ secret_token: token }).eq('id', connectionId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/integrations')
  return token
}

export async function deleteConnection(connectionId: string): Promise<void> {
  const { supabase } = await requireUser()
  const { error } = await supabase.from('integration_connections').delete().eq('id', connectionId)
  if (error) throw new Error(error.message)
  revalidatePath('/settings/integrations')
}

/** Simulate a webhook from inside the app (paste JSON → run the real processor). */
export async function simulateEvent(connectionId: string, payloadText: string): Promise<ProcessResult> {
  const { supabase } = await requireUser()
  const { data: conn } = await supabase
    .from('integration_connections')
    .select('secret_token, provider')
    .eq('id', connectionId)
    .single()
  if (!conn) return { ok: false, error: 'connection_not_found' }

  let payload: unknown
  try {
    payload = JSON.parse(payloadText)
  } catch {
    return { ok: false, error: 'invalid_json' }
  }

  const result = await processIntegrationPayload({
    supabase: supabase as unknown as SupabaseClient,
    token: conn.secret_token,
    providerHint: conn.provider,
    payload,
  })
  revalidatePath('/settings/integrations')
  revalidatePath('/today')
  return result
}

/** Replay an event. Failed events are cleared first so they can reprocess. */
export async function replayEvent(eventId: string): Promise<ProcessResult> {
  const { supabase } = await requireUser()
  const { data: ev } = await supabase
    .from('integration_events')
    .select('id, status, payload, integration_connection_id')
    .eq('id', eventId)
    .single()
  if (!ev) return { ok: false, error: 'event_not_found' }

  const { data: conn } = await supabase
    .from('integration_connections')
    .select('secret_token, provider')
    .eq('id', ev.integration_connection_id)
    .single()
  if (!conn) return { ok: false, error: 'connection_not_found' }

  // Clear a failed event so its dedupe_key frees up for reprocessing.
  if (ev.status === 'failed') {
    await supabase.from('integration_events').delete().eq('id', eventId)
  }

  const result = await processIntegrationPayload({
    supabase: supabase as unknown as SupabaseClient,
    token: conn.secret_token,
    providerHint: conn.provider,
    payload: ev.payload,
  })
  revalidatePath('/settings/integrations')
  revalidatePath('/today')
  return result
}
