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

  // Auth is optional here — previewing an invite must work logged-out. Any
  // failure resolving the session must not crash the public page.
  let user = null
  try {
    const supabase = await createClient()
    const res = await supabase.auth.getUser()
    user = res.data.user
  } catch { /* treat as logged-out */ }

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
