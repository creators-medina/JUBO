import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getConversationThreads } from '@/features/conversations/queries'
import { ConversationsPageClient } from '@/features/conversations/panels/ConversationsPageClient'

export const dynamic = 'force-dynamic'

export default async function ConversationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('organization_members').select('organization_id').eq('user_id', user.id).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')

  const threads = await getConversationThreads(membership.organization_id)
  return <ConversationsPageClient threads={threads} />
}
