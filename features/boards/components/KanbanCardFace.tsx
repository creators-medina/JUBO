'use client'

// ─────────────────────────────────────────────────────────────────────────
// Shared Kanban card FACE (Phase 37B-2E · premium pass 36B) — the visual
// content of a Kanban card, rendered by BOTH the real draggable card and the
// DragOverlay so the dragged preview looks exactly like the card lifted off the
// board. Presentation only — no new queries, no engine/schema changes. All data
// (title, status, common fields, checklist, owner, updated_at) is already loaded
// for the board and is simply surfaced with a clearer CRM hierarchy.
// ─────────────────────────────────────────────────────────────────────────

import { Building2, CheckSquare, Clock, DollarSign, Mail, Phone, User } from 'lucide-react'
import { parseOptions } from '@/features/fields/status'
import { computeGroupChecklist } from '@/features/fields/checklist'
import { type VisibilityIndex } from '@/features/fields/visibility'
import { cn } from '@/lib/utils'

const STATUS_EMPTY = '#64748b'
const COMMON_PRIORITY: Record<string, number> = { email: 0, phone: 1, currency: 2 }

export function formatCellValue(field: any, fv: any): string {
  if (!fv) return ''
  switch (field.field_type) {
    case 'currency': return fv.value_number != null ? `$${Number(fv.value_number).toLocaleString()}` : ''
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
  common: { name: string; value: string; type?: string }[]
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
  const common = groupFields
    .filter((f) => f.common_field_key_id && f.field_type !== 'checklist' && !f.is_default_status)
    .sort((a, b) => (COMMON_PRIORITY[a.field_type] ?? 9) - (COMMON_PRIORITY[b.field_type] ?? 9))
    .map((f) => ({ name: f.name, value: formatCellValue(f, fvMap[f.id]), type: f.field_type }))
    .filter((c) => c.value)
    .slice(0, 3)
  const checklist = computeGroupChecklist(allFields, groupId, visibilityIndex, fvMap)
  return { title: record.title, statusLabel, statusColor, common, hasOwner: !!record.owner_user_id, updatedAt: record.updated_at, checklist }
}

/** Icon for a secondary contact field — keeps the person's details scannable. */
function commonIcon(type?: string) {
  switch (type) {
    case 'email': return Mail
    case 'phone': return Phone
    case 'currency': return DollarSign
    case 'relation': case 'user': return Building2
    default: return null
  }
}

export function KanbanCardFace({ title, statusLabel, statusColor, common, hasOwner, updatedAt, checklist }: KanbanFace) {
  const updatedLabel = formatRelativeTime(updatedAt)
  const checklistDone = checklist.hasChecklist && checklist.percentage === 100
  return (
    <>
      {/* PRIMARY — the person. First thing the eye lands on. */}
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-sm font-semibold leading-snug tracking-tight text-foreground">
          {title || 'Untitled'}
        </span>
        {hasOwner && (
          <span
            className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted-foreground/70"
            aria-label="Assigned"
          >
            <User className="h-3 w-3" />
          </span>
        )}
      </div>

      {/* STATUS — easy-to-scan pill. */}
      {statusLabel && (
        <span
          className="mt-2 inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold leading-none text-white shadow-sm"
          style={{ backgroundColor: statusColor }}
        >
          {statusLabel}
        </span>
      )}

      {/* SECONDARY — contact details (phone / email / company / source). */}
      {common.length > 0 && (
        <div className="mt-2.5 space-y-1">
          {common.map((c, i) => {
            const Icon = commonIcon(c.type)
            return (
              <div key={i} className="flex items-center gap-1.5 text-[11px] leading-tight">
                {Icon ? (
                  <Icon className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
                ) : (
                  <span className="flex-shrink-0 text-muted-foreground/70">{c.name}:</span>
                )}
                <span className="truncate text-foreground/90">{c.value}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* TERTIARY — checklist progress (visual bar, no new data). */}
      {checklist.hasChecklist && (
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <CheckSquare className={cn('h-3 w-3', checklistDone ? 'text-emerald-400' : 'text-muted-foreground/70')} />
              <span className="tabular-nums">{checklist.completedCount} / {checklist.totalCount}</span>
            </span>
            <span className="tabular-nums font-medium">{checklist.percentage}%</span>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
            <div
              className={cn('h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none', checklistDone ? 'bg-emerald-400' : 'bg-primary')}
              style={{ width: `${checklist.percentage}%` }}
            />
          </div>
        </div>
      )}

      {/* TERTIARY — last activity, derived from updated_at already on the record. */}
      {updatedLabel && (
        <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground/60">
          <Clock className="h-2.5 w-2.5 flex-shrink-0" />
          <span>{updatedLabel}</span>
        </div>
      )}
    </>
  )
}
