// ─────────────────────────────────────────────────────────────────────────
// PremiumSurface — a framed surface with a subtle multi-color edge and an
// optional slow light sweep (Phase 34D-A). Visual styling lives in globals.css
// (.premium-surface*) so this stays a thin, dependency-free wrapper. Reserved
// for heroes and a few key cards — not for general cards, tables, or modals.
//
//   <PremiumSurface sweep className="rounded-2xl bg-card p-6">…</PremiumSurface>
//   <PremiumSurface tone="achievement" …>            // goal-hit / win states
//
// Decorations render below the children (see globals.css), so contrast and
// readability are unaffected, and the sweep is disabled under reduced-motion.
// ─────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'

export type PremiumSurfaceProps = React.HTMLAttributes<HTMLDivElement> & {
  /** Enable the occasional light sweep (use sparingly — heroes / theme card). */
  sweep?: boolean
  /** 'achievement' swaps the edge to emerald→gold + a soft halo for win states. */
  tone?: 'default' | 'achievement'
}

export function PremiumSurface({
  sweep = false,
  tone = 'default',
  className,
  children,
  ...rest
}: PremiumSurfaceProps) {
  return (
    <div
      className={cn(
        'premium-surface',
        sweep && 'premium-surface--sweep',
        tone === 'achievement' && 'premium-surface--achievement',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  )
}
