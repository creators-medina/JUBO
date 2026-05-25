import { redirect } from 'next/navigation'

// Integrations now live under settings (Phase 17 sync engine).
export default function IntegrationsRedirect() {
  redirect('/settings/integrations')
}
