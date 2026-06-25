'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Command, Check, AlertCircle, LogIn, UserPlus } from 'lucide-react'
import { acceptInvitation } from './invites'
import type { InvitationPreview } from './queries'

const STORAGE_KEY = 'jubo_invite_token'

const ACCEPT_ERRORS: Record<string, string> = {
  invalid: 'This invite link is invalid.',
  revoked: 'This invitation has been revoked.',
  already_used: 'This invitation has already been used.',
  expired: 'This invitation has expired. Ask an admin to send a new one.',
  email_mismatch: 'This invitation is for a different email address.',
  org_missing: 'That organization no longer exists.',
  not_authenticated: 'Please sign in to accept this invitation.',
}

export function InviteAcceptClient({
  token,
  preview,
  isLoggedIn,
  currentEmail,
}: {
  token: string | null
  preview: InvitationPreview
  isLoggedIn: boolean
  currentEmail: string | null
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)

  // Persist the token so the user can return here after signing up / logging in.
  useEffect(() => {
    if (token) {
      try { sessionStorage.setItem(STORAGE_KEY, token) } catch {}
    }
  }, [token])

  const acceptUrl = token ? `/invite/accept?token=${encodeURIComponent(token)}` : '/invite/accept'
  const invalid = !token || !preview.found
  const expired = preview.expired || preview.status === 'expired'
  const notPending = preview.found && preview.status && preview.status !== 'pending'
  const emailMismatch = isLoggedIn && currentEmail && preview.email && currentEmail.toLowerCase() !== preview.email.toLowerCase()

  const accept = () => {
    if (!token) return
    setAcceptError(null)
    startTransition(async () => {
      let res
      try {
        res = await acceptInvitation(token)
      } catch {
        setAcceptError('Something went wrong accepting the invitation. Please try again.')
        return
      }
      if ('error' in res) {
        setAcceptError(ACCEPT_ERRORS[res.error] ?? 'Could not accept the invitation.')
        return
      }
      try { sessionStorage.removeItem(STORAGE_KEY) } catch {}
      setDone(true)
      router.push('/today')
      router.refresh()
    })
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 flex items-center justify-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-jubo-navy"><Command className="h-4 w-4 text-primary-foreground" /></div>
        <span className="text-lg font-semibold text-foreground">Jubo</span>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        {invalid ? (
          <State icon={<AlertCircle className="h-5 w-5 text-jubo-gold" />} title="Invalid invite link"
            body="This link is missing or doesn't match an invitation. Ask your admin to send a new one." />
        ) : expired ? (
          <State icon={<AlertCircle className="h-5 w-5 text-jubo-gold" />} title="Invitation expired"
            body="This invite is no longer valid. Ask an admin to resend it." />
        ) : notPending ? (
          <State icon={<AlertCircle className="h-5 w-5 text-jubo-gold" />} title="Invitation unavailable"
            body={`This invitation is ${preview.status}. Ask an admin to send a new one.`} />
        ) : done ? (
          <State icon={<Check className="h-5 w-5 text-jubo-green" />} title="You're in!" body="Taking you to your workspace…" />
        ) : (
          <>
            <h1 className="text-base font-semibold text-foreground">
              Join {preview.organizationName}
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              You&apos;ve been invited as <span className="capitalize text-foreground">{preview.role}</span>
              {preview.email ? <> · for <span className="text-foreground">{preview.email}</span></> : null}.
            </p>

            {emailMismatch ? (
              <div className="mt-4 rounded-lg border border-jubo-gold/40 bg-jubo-gold-soft px-3 py-2.5 text-xs text-amber-200">
                This invitation is for <span className="font-medium">{preview.email}</span>, but you&apos;re signed in as{' '}
                <span className="font-medium">{currentEmail}</span>. Sign in with the invited email to accept.
              </div>
            ) : isLoggedIn ? (
              <>
                <button
                  onClick={accept}
                  disabled={pending}
                  className="mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {pending ? 'Joining…' : <><Check className="h-3.5 w-3.5" /> Join {preview.organizationName}</>}
                </button>
                {acceptError && (
                  <p className="mt-3 rounded-lg border border-jubo-gold/40 bg-jubo-gold-soft px-3 py-2 text-xs text-amber-200">{acceptError}</p>
                )}
              </>
            ) : (
              <div className="mt-5 space-y-2">
                <p className="text-2xs text-muted-foreground">Sign in or create your account to join.</p>
                <Link
                  href={`/login?next=${encodeURIComponent(acceptUrl)}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <LogIn className="h-3.5 w-3.5" /> Log in to join
                </Link>
                <Link
                  href={`/signup?next=${encodeURIComponent(acceptUrl)}${preview.email ? `&email=${encodeURIComponent(preview.email)}` : ''}`}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-1"
                >
                  <UserPlus className="h-3.5 w-3.5" /> Create account to join
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function State({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">{body}</p>
    </div>
  )
}
