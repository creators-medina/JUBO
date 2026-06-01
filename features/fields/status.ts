// ─────────────────────────────────────────────────────────────────────────
// Status / select option helpers. The DB type stays `select` — colored status
// is just a select whose options carry `color`. A normalized option shape lets
// renderers and cell editors stay simple.
// ─────────────────────────────────────────────────────────────────────────

export type RawOption = string | { label: string; color?: string; value?: string }

export type StatusOption = {
  label: string
  color?: string
}

/** Monday-flavored palette — calm dark-theme hues. Cycled when auto-creating
 *  options from distinct imported values. */
export const STATUS_PALETTE = [
  '#10b981', // emerald  — done / success
  '#f59e0b', // amber    — working on it
  '#ef4444', // red      — stuck
  '#3b82f6', // blue     — in review
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#64748b', // slate    — not started
] as const

/** Normalize whatever shape sits in field.config.options into StatusOption[]. */
export function parseOptions(config: unknown): StatusOption[] {
  if (!config || typeof config !== 'object') return []
  const raw = (config as { options?: unknown }).options
  if (!Array.isArray(raw)) return []
  const out: StatusOption[] = []
  for (const o of raw) {
    if (typeof o === 'string') {
      const label = o.trim()
      if (label) out.push({ label })
    } else if (o && typeof o === 'object') {
      const label = `${(o as { label?: string }).label ?? ''}`.trim()
      if (!label) continue
      const color = (o as { color?: string }).color
      out.push({ label, color: typeof color === 'string' ? color : undefined })
    }
  }
  return out
}

/** Any option with a color → render the field as colored pills (status). */
export function isColoredStatus(opts: StatusOption[]): boolean {
  return opts.some((o) => !!o.color)
}

/** Pick a color for a brand-new option by cycling the palette around used ones. */
export function nextStatusColor(existing: StatusOption[]): string {
  const used = new Set(existing.map((o) => o.color).filter(Boolean) as string[])
  for (const c of STATUS_PALETTE) if (!used.has(c)) return c
  return STATUS_PALETTE[existing.length % STATUS_PALETTE.length]
}

/** Build status options from a set of distinct cell values (used on import). */
export function statusOptionsFromValues(values: string[]): StatusOption[] {
  const seen = new Set<string>()
  const out: StatusOption[] = []
  for (const v of values) {
    const label = `${v}`.trim()
    if (!label || seen.has(label.toLowerCase())) continue
    seen.add(label.toLowerCase())
    out.push({ label, color: STATUS_PALETTE[out.length % STATUS_PALETTE.length] })
  }
  return out
}
