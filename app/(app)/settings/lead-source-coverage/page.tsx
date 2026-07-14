import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { buildLeadSourceCoverage } from '@/features/reports/leadSourceCoverage'
import { LeadSourceCoverageClient } from '@/features/reports/LeadSourceCoverageClient'

export const dynamic = 'force-dynamic'

// ─────────────────────────────────────────────────────────────────────────
// Lead Source & Ownership Coverage report (Phase A, Roadmap Step 8).
// READ-ONLY. Guarded with the exact same owner/admin pattern the analytics
// settings page uses — no new auth/permission behavior.
// ─────────────────────────────────────────────────────────────────────────

export default async function LeadSourceCoveragePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('organization_members').select('organization_id, role').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  // Admin-only — same convention as settings/analytics.
  if (!['owner', 'admin'].includes((membership as { role: string }).role)) redirect('/today')

  const report = await buildLeadSourceCoverage(membership.organization_id)
  return (
    <div className="h-full overflow-y-auto">
      <LeadSourceCoverageClient report={report} />
    </div>
  )
}
