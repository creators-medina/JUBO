// ─────────────────────────────────────────────────────────────────────────
// Setup checklist seed — operational activation tracking.
//
// Seeded once at the end of onboarding. Each item points the LO at where to
// complete it. Completion is toggled from the checklist UI / when the relevant
// action happens.
// ─────────────────────────────────────────────────────────────────────────

export type ChecklistItemSpec = {
  item_key: string
  title: string
  description: string
  icon: string
  action_href: string
}

export const SETUP_CHECKLIST: ChecklistItemSpec[] = [
  { item_key: 'import-past-clients', title: 'Import your past clients', description: 'Bring your database in so retention workflows have something to work with.', icon: 'Upload',      action_href: '/imports/new?template=past_clients' },
  { item_key: 'connect-arive',       title: 'Connect Arive',           description: 'Sync your LOS so pipeline files flow in automatically.',                       icon: 'Plug',        action_href: '/integrations' },
  { item_key: 'complete-profile',    title: 'Complete your profile',   description: 'Add your details so the workspace is fully yours.',                            icon: 'UserCircle',  action_href: '/settings' },
  { item_key: 'customize-dashboard', title: 'Customize a dashboard',   description: 'Tweak widgets so your numbers show up the way you think about them.',           icon: 'LayoutDashboard', action_href: '/dashboard' },
  { item_key: 'review-workflows',    title: 'Review your automations', description: 'Confirm the workflows Jubo switched on match how you work.',                    icon: 'Workflow',    action_href: '/settings/workflows' },
  { item_key: 'review-goals',        title: 'Review your goals',       description: 'Check your production goal and tune the conversion assumptions.',               icon: 'Target',      action_href: '/goals' },
  { item_key: 'invite-team',         title: 'Invite your team',        description: 'Bring processors and partners into the workspace.',                            icon: 'Users',       action_href: '/settings' },
]
