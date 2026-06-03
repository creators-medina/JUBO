import { createClient } from '@/lib/supabase/server'
import { getInvitationPreview } from '@/features/organizations/queries'
import { InviteAcceptClient } from '@/features/organizations/InviteAcceptClient'

export const dynamic = 'force-dynamic'

export default async function InviteAcceptPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const preview = token ? await getInvitationPreview(token) : { found: false }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <InviteAcceptClient
        token={token ?? null}
        preview={preview}
        isLoggedIn={!!user}
        currentEmail={user?.email ?? null}
      />
    </div>
  )
}
