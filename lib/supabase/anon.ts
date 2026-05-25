import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * A session-less Supabase client for webhook route handlers (no user cookies).
 * Uses the public anon key — all inbound writes are gated by token-validating
 * SECURITY DEFINER RPCs, NOT by RLS/auth.uid(). Never use the service role here.
 */
export function createAnonClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder-anon-key',
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}
