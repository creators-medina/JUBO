import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/shell/AppShell'
import { OrganizationProvider } from '@/providers/OrganizationProvider'
import { WorkspaceTabsProvider } from '@/features/workspace/providers/WorkspaceTabsProvider'
import { WorkspaceTabsBar } from '@/features/workspace/components/WorkspaceTabsBar'
import { WorkspacePanel } from '@/features/workspace/components/WorkspacePanel'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check if user has any org membership
  const { data: memberships } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (!memberships || memberships.length === 0) {
    redirect('/onboarding')
  }

  return (
    <OrganizationProvider>
      <WorkspaceTabsProvider>
        <AppShell>
          <WorkspaceTabsBar />
          {children}
        </AppShell>
        <WorkspacePanel />
      </WorkspaceTabsProvider>
    </OrganizationProvider>
  )
}
