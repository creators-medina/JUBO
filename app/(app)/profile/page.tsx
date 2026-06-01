import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ContentContainer } from '@/components/primitives/ContentContainer'
import { PageHeader } from '@/components/primitives/PageHeader'
import { UserCircle, Mail, Building2, Shield } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch the LO's name + their first org + role in parallel.
  const [profileQ, memberQ] = await Promise.all([
    supabase.from('profiles').select('first_name, last_name, email').eq('id', user.id).maybeSingle(),
    supabase
      .from('organization_members')
      .select('role, organizations(name)')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle(),
  ])

  const profile = profileQ.data
  const member = memberQ.data as { role: string; organizations: { name: string } | null } | null

  const first = profile?.first_name ?? ''
  const last = profile?.last_name ?? ''
  const fullName = `${first} ${last}`.trim() || '—'
  const email = profile?.email ?? user.email ?? '—'
  const orgName = member?.organizations?.name ?? '—'
  const role = member?.role ?? '—'

  return (
    <ContentContainer maxWidth="md">
      <PageHeader title="My Profile" description="Your account details." />
      <div className="rounded-xl border border-border bg-card divide-y divide-border">
        <Row icon={<UserCircle className="h-4 w-4" />} label="Name" value={fullName} />
        <Row icon={<Mail className="h-4 w-4" />} label="Email" value={email} />
        <Row icon={<Building2 className="h-4 w-4" />} label="Organization" value={orgName} />
        <Row icon={<Shield className="h-4 w-4" />} label="Role" value={<span className="capitalize">{role}</span>} />
      </div>
      <p className="mt-3 text-2xs text-muted-foreground">
        Editing your profile is coming soon. Need to change something now? Contact your workspace admin.
      </p>
    </ContentContainer>
  )
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-1 text-muted-foreground">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-2xs text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground truncate">{value}</p>
      </div>
    </div>
  )
}
