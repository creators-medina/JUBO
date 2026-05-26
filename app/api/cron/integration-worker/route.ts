import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient, hasAdminCredentials } from '@/lib/supabase/admin'
import { runCron } from '@/features/integrations/runtime/cron'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

/**
 * Headless integration worker — drains pending events + runs scheduled jobs for
 * every active org, with no user session. Authorized by `CRON_SECRET` only.
 * Compatible with Vercel Cron (sends `Authorization: Bearer <CRON_SECRET>`).
 */
async function handle(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'cron_not_configured' }, { status: 503 })
  }
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  if (!hasAdminCredentials()) {
    return NextResponse.json({ ok: false, error: 'service_role_missing' }, { status: 503 })
  }

  try {
    const admin = createAdminClient()
    const summary = await runCron(admin)
    return NextResponse.json({ ok: true, ...summary })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'cron_error' }, { status: 500 })
  }
}

// Vercel Cron issues GET; allow POST too for manual/CI triggers.
export const GET = handle
export const POST = handle
