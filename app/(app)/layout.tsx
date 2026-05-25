import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/shell/AppShell'
import { OrganizationProvider } from '@/providers/OrganizationProvider'

export const dynamic = 'force-dynamic'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: memberships } = await supabase
    .from('organization_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)

  if (!memberships || memberships.length === 0) {
    redirect('/onboarding')
  }

  // AppShell owns the command/workspace/toast providers + the WorkspacePanel,
  // CommandPalette, and tab bar. Keeping them in one place avoids duplicate
  // provider instances (which previously split workspace state in two).
  return (
    <OrganizationProvider>
      <AppShell>{children}</AppShell>
    </OrganizationProvider>
  )
}
