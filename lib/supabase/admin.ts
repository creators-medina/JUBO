import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Server-only Supabase admin client (service role). BYPASSES RLS — use ONLY in
 * trusted server code (cron route, headless worker). NEVER import this from a
 * client component: it reads SUPABASE_SERVICE_ROLE_KEY, a non-public secret that
 * must stay server-side. Fails loudly if the key is missing.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error(
      'createAdminClient requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-only).',
    )
  }
  return createSupabaseClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function hasAdminCredentials(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}
