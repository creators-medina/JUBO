'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { UserCircle, Settings as SettingsIcon, LogOut, Loader2 } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/hooks/useAuth'

/**
 * Top-right account menu. Trigger is the user avatar; the menu exposes the
 * three Phase 30C MVP actions. Sign-out uses the existing AuthProvider
 * `signOut()` (which calls `supabase.auth.signOut()`) and pushes to /login.
 */
export function AccountMenu() {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const [isPending, startTransition] = useTransition()

  const email = user?.email ?? ''
  const initials = email ? email.slice(0, 2).toUpperCase() : '??'

  const handleSignOut = () => {
    startTransition(async () => {
      try { await signOut() } finally { router.push('/login') }
    })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Open account menu"
        className="rounded-full ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <Avatar className="h-7 w-7 cursor-pointer">
          <AvatarFallback className="bg-primary text-primary-foreground text-xs font-semibold">
            {isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {email && (
          <>
            <DropdownMenuLabel className="font-normal">
              <p className="text-2xs text-muted-foreground">Signed in as</p>
              <p className="truncate text-xs text-foreground">{email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onSelect={() => router.push('/profile')} className="cursor-pointer text-xs">
          <UserCircle className="mr-2 h-3.5 w-3.5" /> My Profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/settings')} className="cursor-pointer text-xs">
          <SettingsIcon className="mr-2 h-3.5 w-3.5" /> Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => { e.preventDefault(); handleSignOut() }}
          disabled={isPending}
          className="cursor-pointer text-xs text-red-300 focus:text-red-200"
        >
          <LogOut className="mr-2 h-3.5 w-3.5" /> Sign Out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
