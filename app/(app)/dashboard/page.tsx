import { redirect } from 'next/navigation'
import { Archivo, IBM_Plex_Sans } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'
import { buildDashboardOverview } from '@/features/dashboards/overview/queries'
import { DashboardOverview } from '@/features/dashboards/overview/DashboardOverview'

export const dynamic = 'force-dynamic'

// Design-handoff type (Dashboard.dc.html): Archivo for numbers/headings,
// IBM Plex Sans for body — scoped to this page via CSS variables.
const archivo = Archivo({ subsets: ['latin'], weight: ['500', '600', '700', '800'], variable: '--font-archivo' })
const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-plex' })

// ─────────────────────────────────────────────────────────────────────────
// /dashboard — the business-overview home screen (Claude Design handoff):
// KPIs with period deltas, active pipeline, today's theme day, upcoming
// closings, monthly goal, recent activity, and follow-ups — all live data.
// (Previously this route redirected to the first widget dashboard; those
// remain available under Insights → /dashboards/[id].)
// ─────────────────────────────────────────────────────────────────────────

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/onboarding')

  const data = await buildDashboardOverview(membership.organization_id, user.id)

  return (
    <div className={`${archivo.variable} ${plex.variable} h-full`}>
      <DashboardOverview data={data} />
    </div>
  )
}
