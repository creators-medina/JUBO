'use client'

// Belt-and-suspenders: if anything in the invite route subtree throws at render,
// show a friendly message instead of the generic "this page couldn't load".
import Link from 'next/link'
import { Command, AlertCircle } from 'lucide-react'

export default function InviteError() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-jubo-navy"><Command className="h-4 w-4 text-primary-foreground" /></div>
          <span className="text-lg font-semibold text-foreground">Jubo</span>
        </div>
        <div className="rounded-xl border border-border bg-card p-6 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-surface-2"><AlertCircle className="h-5 w-5 text-jubo-gold" /></div>
          <p className="text-sm font-medium text-foreground">We couldn&apos;t load this invitation</p>
          <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
            The link may be invalid or expired. Ask your admin to send a fresh invite link.
          </p>
          <Link href="/login" className="mt-5 inline-flex w-full items-center justify-center rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-1">
            Go to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
