'use client'

// ─────────────────────────────────────────────────────────────────────────
// Shared Kanban card FACE (Phase 37B-2E · premium pass 36B) — the visual
// content of a Kanban card, rendered by BOTH the real draggable card and the
// DragOverlay so the dragged preview looks exactly like the card lifted off the
// board. Presentation only — no new queries, no engine/schema changes. All data
// (title, status, common fields, checklist, owner, updated_at) is already loaded
// for the board and is simply surfaced with a clearer CRM hierarchy.
// ─────────────────────────────────────────────────────────────────────────

import { Building2, Clock, Mail, Phone, User } from 'lucide-react'
import { parseOptions } from '@/features/fields/status'
import { computeGroupChecklist } from '@/features/fields/checklist'
import { type VisibilityIndex } from '@/features/fields/visibility'
import { cn } from '@/lib/utils'

const STATUS_EMPTY = '#64748b'
const COMMON_PRIORITY: Record<string, number> = { email: 0, phone: 1, currency: 2 }

export function formatCellValue(field: any, fv: any): string {
  if (!fv) return ''
  switch (field.field_type) {
    // Whole dollars — matches the contact card / tracker currency formatting.
    case 'currency': return fv.value_number != null ? `$${Number(fv.value_number).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : ''
    case 'number': case 'rating': return fv.value_number != null ? String(fv.value_number) : ''
    case 'boolean': case 'checklist': return fv.value_boolean === true ? 'Yes' : fv.value_boolean === false ? 'No' : ''
    case 'date': case 'datetime': return fv.value_date ? fv.value_date.split('T')[0] : (fv.value_text ?? '')
    case 'multiselect': case 'tags': return Array.isArray(fv.value_json) ? fv.value_json.join(', ') : (fv.value_text ?? '')
    default: return fv.value_text ?? ''
  }
}

/** Relative "last activity" from data already on the record (no query). */
export function formatRelativeTime(iso?: string | null): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diff = Date.now() - then
  if (diff < 0) return ''
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w ago`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export type KanbanFace = {
  title: string
  statusLabel: string
  statusColor: string
  amount?: string            // loan amount / value — shown top-right
  common: { name: string; value: string; type?: string }[]  // contact details (currency excluded)
  hasOwner: boolean
  updatedAt?: string | null
  checklist: { completedCount: number; totalCount: number; percentage: number; hasChecklist: boolean }
}

/** Build the face data for a record — single source of truth for card + overlay. */
export function buildKanbanFace(opts: {
  record: any
  groupFields: any[]
  fvMap: Record<string, any>
  allFields: any[]
  groupId: string | null
  visibilityIndex: VisibilityIndex
  pending?: boolean
}): KanbanFace {
  const { record, groupFields, fvMap, allFields, groupId, visibilityIndex, pending } = opts
  const dsf = groupFields.find((f) => f.is_default_status)
  const statusLabel = pending ? '' : (dsf ? (fvMap[dsf.id]?.value_text ?? '') : '')
  const statusColor = statusLabel && dsf
    ? (parseOptions(dsf.config).find((o) => o.label === statusLabel)?.color || STATUS_EMPTY)
    : STATUS_EMPTY
  // Loan amount / value → surfaced on the top-right (the one card accent value),
  // so it isn't buried in the detail rows.
  const currencyField = groupFields.find((f) => f.common_field_key_id && f.field_type === 'currency' && !f.is_default_status)
  const amount = currencyField ? formatCellValue(currencyField, fvMap[currencyField.id]) : ''
  // Contact details (email / phone / other) — currency excluded, kept compact.
  const common = groupFields
    .filter((f) => f.common_field_key_id && f.field_type !== 'checklist' && f.field_type !== 'currency' && !f.is_default_status)
    .sort((a, b) => (COMMON_PRIORITY[a.field_type] ?? 9) - (COMMON_PRIORITY[b.field_type] ?? 9))
    .map((f) => ({ name: f.name, value: formatCellValue(f, fvMap[f.id]), type: f.field_type }))
    .filter((c) => c.value)
    .slice(0, 2)
  const checklist = computeGroupChecklist(allFields, groupId, visibilityIndex, fvMap)
  return { title: record.title, statusLabel, statusColor, amount, common, hasOwner: !!record.owner_user_id, updatedAt: record.updated_at, checklist }
}

/** Icon for a secondary contact field — keeps the person's details scannable. */
function commonIcon(type?: string) {
  switch (type) {
    case 'email': return Mail
    case 'phone': return Phone
    case 'relation': case 'user': return Building2
    default: return null
  }
}

// Condensed, uniform card: cream shell (from the card button), navy name, one
// muted-green loan amount, taupe details, a subtle status dot, and a slim
// checklist bar. Missing fields collapse their row entirely (no empty gaps).
export function KanbanCardFace({ title, statusLabel, statusColor, amount, common, hasOwner, updatedAt, checklist }: KanbanFace) {
  const updatedLabel = formatRelativeTime(updatedAt)
  const checklistDone = checklist.hasChecklist && checklist.percentage === 100
  return (
    <>
      {/* Top — borrower name (left) + loan amount (right). */}
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold leading-snug tracking-tight text-jubo-navy">
          {title || 'Untitled'}
        </span>
        {amount && (
          <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-jubo-green">{amount}</span>
        )}
      </div>

      {/* Contact details — compact single wrapping row (email / phone / etc). */}
      {common.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] leading-tight text-muted-foreground">
          {common.map((c, i) => {
            const Icon = commonIcon(c.type)
            return (
              <span key={i} className="inline-flex min-w-0 items-center gap-1">
                {Icon ? (
                  <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
                ) : (
                  <span className="flex-shrink-0 text-muted-foreground/70">{c.name}:</span>
                )}
                <span className="truncate">{c.value}</span>
              </span>
            )
          })}
        </div>
      )}

      {/* Meta — status (subtle dot + muted label), last activity, owner — one row. */}
      {(statusLabel || updatedLabel || hasOwner) && (
        <div className="mt-1.5 flex items-center gap-2.5 text-[10px] text-muted-foreground">
          {statusLabel && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <span aria-hidden className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: statusColor }} />
              <span className="truncate text-jubo-text-soft">{statusLabel}</span>
            </span>
          )}
          {updatedLabel && (
            <span className="inline-flex flex-shrink-0 items-center gap-1">
              <Clock className="h-2.5 w-2.5" />{updatedLabel}
            </span>
          )}
          {hasOwner && (
            <span className="ml-auto inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground/70" aria-label="Assigned">
              <User className="h-2.5 w-2.5" />
            </span>
          )}
        </div>
      )}

      {/* Checklist — slim inline progress (bar + count). */}
      {checklist.hasChecklist && (
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', checklistDone ? 'bg-jubo-green' : 'bg-jubo-gold')}
              style={{ width: `${checklist.percentage}%` }}
            />
          </div>
          <span className="flex-shrink-0 text-[10px] tabular-nums text-muted-foreground">{checklist.completedCount}/{checklist.totalCount}</span>
        </div>
      )}
    </>
  )
}
