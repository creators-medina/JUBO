'use client'

import { HelpCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Lightweight "why am I seeing this?" tooltip — CSS hover/focus, no JS lib. */
export function HelpTip({ text, className, side = 'bottom' }: { text: string; className?: string; side?: 'bottom' | 'top' }) {
  return (
    <span className={cn('group relative inline-flex align-middle', className)} tabIndex={0}>
      <HelpCircle className="h-3.5 w-3.5 cursor-help text-muted-foreground/60 transition-colors hover:text-muted-foreground" />
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 w-56 -translate-x-1/2 rounded-lg border border-border bg-card px-2.5 py-2 text-2xs leading-relaxed text-muted-foreground opacity-0 shadow-xl transition-opacity duration-100 group-hover:opacity-100 group-focus:opacity-100',
          side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5',
        )}
      >
        {text}
      </span>
    </span>
  )
}
