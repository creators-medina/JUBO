import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ContentContainer } from '@/components/primitives/ContentContainer'
import { PageHeader } from '@/components/primitives/PageHeader'
import { MetricCard } from '@/components/primitives/MetricCard'
import { Activity, Target, Columns3, FileText } from 'lucide-react'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('organization_members')
    .select('organization_id, role, organizations(name)')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (!membership) redirect('/onboarding')

  const orgId = membership.organization_id

  const [boardsRes, recordsRes, tasksRes, goalsRes] = await Promise.all([
    supabase.from('boards').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_archived', false),
    supabase.from('records').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_archived', false),
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).is('completed_at', null),
    supabase.from('goals').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
  ])

  const org = membership.organizations as any

  return (
    <ContentContainer>
      <PageHeader
        title={`${org?.name ?? 'Dashboard'}`}
        description="Your workspace overview"
      />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard label="Boards" value={boardsRes.count ?? 0} icon={Columns3} />
        <MetricCard label="Active Records" value={recordsRes.count ?? 0} icon={FileText} />
        <MetricCard label="Open Tasks" value={tasksRes.count ?? 0} icon={Activity} />
        <MetricCard label="Active Goals" value={goalsRes.count ?? 0} icon={Target} />
      </div>
    </ContentContainer>
  )
}
