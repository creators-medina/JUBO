import Link from 'next/link'
import { ContentContainer } from '@/components/primitives/ContentContainer'
import { PageHeader } from '@/components/primitives/PageHeader'
import { UserCircle, Building2, Users, Target, Gauge, Plug, ChevronRight } from 'lucide-react'

type SectionCard = {
  title: string
  description: string
  href: string
  icon: React.ElementType
  status?: 'live' | 'soon'
}

const SECTIONS: SectionCard[] = [
  {
    title: 'Profile',
    description: 'Your name, email, organization, and role.',
    href: '/profile',
    icon: UserCircle,
    status: 'live',
  },
  {
    title: 'Organization',
    description: 'Company name, logo, timezone, team size, and volume goal.',
    href: '/settings/organization',
    icon: Building2,
    status: 'live',
  },
  {
    title: 'Team',
    description: 'Manage members, roles, and access. (Invites in 31C.)',
    href: '/settings/team',
    icon: Users,
    status: 'live',
  },
  {
    title: 'Business Plan',
    description: 'Your income goal reverse-engineered into a daily plan.',
    href: '/business-plan',
    icon: Gauge,
    status: 'live',
  },
  {
    title: 'Goals',
    description: 'Production goals, funnels, and conversion assumptions.',
    href: '/goals',
    icon: Target,
    status: 'live',
  },
  {
    title: 'Integrations',
    description: 'Connect Arive, Twilio, Zapier, and more.',
    href: '/settings/integrations',
    icon: Plug,
    status: 'live',
  },
]

export default function SettingsPage() {
  return (
    <ContentContainer maxWidth="md">
      <PageHeader title="Settings" description="Manage your workspace, profile, goals, and integrations." />
      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <SectionLink key={s.title} {...s} />
        ))}
      </div>
    </ContentContainer>
  )
}

function SectionLink({ title, description, href, icon: Icon, status }: SectionCard) {
  const inner = (
    <>
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-jubo-navy/10 text-jubo-navy">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium text-foreground">{title}</p>
          {status === 'soon' && (
            <span className="rounded-full bg-surface-2 px-1.5 py-0.5 text-2xs text-muted-foreground">
              Coming soon
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {status !== 'soon' && (
        <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
      )}
    </>
  )

  // "Coming soon" sections render as non-interactive cards — no dead links.
  if (status === 'soon') {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 opacity-60">
        {inner}
      </div>
    )
  }

  return (
    <Link
      href={href}
      className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-jubo-navy/40 hover:bg-surface-1"
    >
      {inner}
    </Link>
  )
}
