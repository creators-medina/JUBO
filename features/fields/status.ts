// ─────────────────────────────────────────────────────────────────────────
// Status / select option helpers. The DB type stays `select` — colored status
// is just a select whose options carry `color`. A normalized option shape lets
// renderers and cell editors stay simple.
// ─────────────────────────────────────────────────────────────────────────

export type RawOption = string | { id?: string; label: string; color?: string; value?: string }

export type StatusOption = {
  /** Stable id so the label editor can target an option across rename/recolor. */
  id?: string
  label: string
  color?: string
}

/** Generate a stable option id (works in browser + node). */
export function newOptionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* fall through */ }
  return `opt_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
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
      const id = (o as { id?: string }).id
      out.push({ id: typeof id === 'string' ? id : undefined, label, color: typeof color === 'string' ? color : undefined })
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
    out.push({ id: newOptionId(), label, color: STATUS_PALETTE[out.length % STATUS_PALETTE.length] })
  }
  return out
}

/** Seed labels for a brand-new Status field (Monday-style defaults, editable). */
export function defaultStatusOptions(): StatusOption[] {
  return [
    { id: newOptionId(), label: 'Not Started', color: '#64748b' },   // gray
    { id: newOptionId(), label: 'Working On It', color: '#f59e0b' }, // amber
    { id: newOptionId(), label: 'Stuck', color: '#ef4444' },         // red
    { id: newOptionId(), label: 'Done', color: '#10b981' },          // green
    { id: newOptionId(), label: 'Pending', color: '#f97316' },       // orange
  ]
}

/** Color for an empty/unset status cell — Monday's neutral gray block. */
export const STATUS_EMPTY_COLOR = '#3a4252'
