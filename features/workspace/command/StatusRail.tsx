'use client'

// ─────────────────────────────────────────────────────────────────────────
// StatusRail (Command Center · Phase 2) — a row of live "instrument" tiles at
// the top of the workspace Overview. Pure presentation: it renders whatever
// tiles it's handed, so it's entity-agnostic and reusable across templates.
// Each tile has a colored top hairline (meaning, not decoration), a big
// tabular value, a quiet label, and an optional sub-line. The health tile can
// carry a softly pulsing dot. No data access, no engine — values are computed
// by the caller from already-loaded record data.
// ─────────────────────────────────────────────────────────────────────────

import { cn } from '@/lib/utils'

export type StatusTile = {
  key: string
  label: string
  value: string
  sub?: string
  /** CSS color for the top hairline / dot (use existing accent tokens). */
  accent: string
  /** Show a small status dot before the value (health tile). */
  dot?: boolean
  /** Softly pulse the dot — "live" cue. Reduced-motion safe. */
  pulse?: boolean
}

export function StatusRail({ tiles }: { tiles: StatusTile[] }) {
  if (tiles.length === 0) return null
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((t) => (
        <div
          key={t.key}
          className="premium-card relative overflow-hidden rounded-xl px-3 py-2.5"
        >
          {/* Colored top hairline — the tile's "channel". */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-0.5"
            style={{ background: `linear-gradient(90deg, ${t.accent}, transparent)` }}
          />
          <p className="text-2xs font-medium uppercase tracking-wider text-muted-foreground">{t.label}</p>
          <div className="mt-1 flex items-center gap-1.5">
            {t.dot && (
              <span
                className={cn('h-2 w-2 flex-shrink-0 rounded-full', t.pulse && 'motion-safe:animate-pulse')}
                style={{ backgroundColor: t.accent }}
                aria-hidden
              />
            )}
            <span className="truncate text-base font-semibold tabular-nums text-foreground">{t.value}</span>
          </div>
          {t.sub && <p className="mt-0.5 truncate text-2xs text-muted-foreground">{t.sub}</p>}
        </div>
      ))}
    </div>
  )
}
