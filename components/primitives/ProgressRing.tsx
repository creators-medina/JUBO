// ─────────────────────────────────────────────────────────────────────────
// ProgressRing — reusable circular progress, promoted from the goal widget's
// inline radial. Pure SVG, no dependencies. The progress arc animates via a
// stroke-dasharray transition; pass `complete` for a celebratory success state.
// Center content is rendered as children (e.g. a count + label).
// ─────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'

export function ProgressRing({
  percent,
  size = 160,
  stroke = 12,
  complete = false,
  trackClassName = 'text-surface-2',
  progressClassName,
  className,
  children,
}: {
  /** 0..100 */
  percent: number
  size?: number
  stroke?: number
  /** Renders the celebratory success state (emerald + glow). */
  complete?: boolean
  trackClassName?: string
  progressClassName?: string
  className?: string
  children?: React.ReactNode
}) {
  const pct = Math.max(0, Math.min(100, percent))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = c * (pct / 100)
  const arcColor = progressClassName ?? (complete ? 'text-emerald-400' : 'text-primary')

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="currentColor" strokeWidth={stroke}
          className={trackClassName}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="currentColor" strokeWidth={stroke}
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
          className={cn(
            'transition-[stroke-dasharray] duration-700 ease-out',
            arcColor,
            complete && 'drop-shadow-[0_0_10px_currentColor]',
          )}
        />
      </svg>
      {children != null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  )
}
