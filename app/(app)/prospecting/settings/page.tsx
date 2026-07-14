import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBoards } from '@/features/boards/queries'
import { getProspectingSchedule } from '@/features/prospecting/schedule/queries'
import { ScheduleEditor } from '@/features/prospecting/schedule/ScheduleEditor'

export const dynamic = 'force-dynamic'

export default async function ProspectingSettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  const orgId = membership.organization_id

  const [{ schedule }, boards] = await Promise.all([
    getProspectingSchedule(orgId, user.id),
    getBoards(orgId),
  ])

  return (
    <ScheduleEditor
      organizationId={orgId}
      initial={schedule}
      boards={boards.map((b) => ({ id: b.id, name: b.name }))}
    />
  )
}
