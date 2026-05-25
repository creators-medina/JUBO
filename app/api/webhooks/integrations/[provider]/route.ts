import { NextRequest, NextResponse } from 'next/server'
import { createAnonClient } from '@/lib/supabase/anon'
import { captureIntegrationEvent } from '@/features/integrations/sync/process'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/** Extract the secret token from header or query (?token= or Authorization: Bearer). */
function extractToken(req: NextRequest): string | null {
  const url = new URL(req.url)
  const q = url.searchParams.get('token')
  if (q) return q
  const header = req.headers.get('x-jubo-token') || req.headers.get('x-webhook-token')
  if (header) return header
  const auth = req.headers.get('authorization')
  if (auth?.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim()
  return null
}

/** GET → friendly readiness probe (so people opening the URL see it's live). */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params
  return NextResponse.json({ ok: true, provider, message: 'Jubo webhook endpoint is live. POST your payload with ?token=…' })
}

/** POST → ingest one payload. Synchronous processing (queue-ready architecture). */
export async function POST(req: NextRequest, ctx: { params: Promise<{ provider: string }> }) {
  const { provider } = await ctx.params

  const token = extractToken(req)
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  // Phase 18: capture fast and return; the authenticated worker processes later.
  const supabase = createAnonClient()
  const result = await captureIntegrationEvent({ supabase, token, providerHint: provider, payload })

  if (!result.ok) {
    // 401 for auth issues, 422 for processing problems — never leak internals.
    const auth = result.error === 'invalid_token' || result.error?.startsWith('connection_')
    return NextResponse.json({ ok: false, error: result.error }, { status: auth ? 401 : 422 })
  }

  // 202 Accepted — the event is queued for async processing.
  return NextResponse.json(
    { ok: true, duplicate: result.duplicate ?? false, queued: !result.duplicate },
    { status: 202 },
  )
}
