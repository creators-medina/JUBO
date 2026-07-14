'use client'

// ─────────────────────────────────────────────────────────────────────────
// Phase 5 — per-record lead-source picker (Contact Card / Loan File).
//
// Self-contained: loads this board's `lead_source` field + this record's
// value, and lets the LO set/clear it through the existing upsertFieldValue
// path (one field, one record — nothing else is written, nothing is ever
// auto-filled or inferred). Legacy/imported values that aren't one of the
// 15 canonical sources are preserved and shown as-is in the dropdown.
//
// When the board has no lead_source field yet, the card offers an explicit
// "Set up lead source" action that provisions the single field via
// ensureLeadSourceField (idempotent; no records touched, no values written).
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from 'react'
import { Loader2, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { upsertFieldValue } from '@/features/records/actions'
import { ensureLeadSourceField } from '@/features/fields/leadSourceActions'
import { LEAD_SOURCE_LABELS } from '@/features/production-plan/calc'

export function LeadSourceCard({ recordId, boardId, organizationId }: {
  recordId: string
  boardId: string | null
  organizationId: string
}) {
  const [loading, setLoading] = useState(true)
  const [fieldId, setFieldId] = useState<string | null>(null)
  const [value, setValue] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    // No board → the component renders nothing (guarded below); every
    // setState here happens after an await, never synchronously in an effect.
    if (!boardId) return
    const supabase = createClient()
    const { data: fields } = await supabase
      .from('fields').select('id').eq('board_id', boardId).eq('slug', 'lead_source').limit(1)
    const id = (fields?.[0] as { id: string } | undefined)?.id ?? null
    let v: string | null = null
    if (id) {
      const { data: fv } = await supabase
        .from('field_values').select('value_text').eq('field_id', id).eq('record_id', recordId).maybeSingle()
      v = (fv as { value_text: string | null } | null)?.value_text ?? null
    }
    setFieldId(id)
    setValue(v)
    setLoading(false)
  }, [boardId, recordId])

  useEffect(() => {
    let active = true
    ;(async () => { if (active) await load() })()
    return () => { active = false }
  }, [load])

  if (!boardId) return null

  const save = async (next: string) => {
    if (!fieldId) return
    const prev = value
    setValue(next || null) // optimistic
    setBusy(true)
    try {
      // One field, one record — the existing safe single-value write path.
      await upsertFieldValue(fieldId, recordId, boardId, { value_text: next || null })
      setError(null)
    } catch (e) {
      setValue(prev) // revert — the server didn't take it
      setError(`Couldn't save — ${e instanceof Error ? e.message : 'please try again'}`)
    } finally {
      setBusy(false)
    }
  }

  const setUp = async () => {
    setBusy(true)
    try {
      await ensureLeadSourceField(boardId, organizationId)
      setError(null)
      await load()
    } catch (e) {
      setError(`Couldn't set up the field — ${e instanceof Error ? e.message : 'please try again'}`)
    } finally {
      setBusy(false)
    }
  }

  // Preserve an unrecognized (legacy/imported) value as a selectable option
  // so opening the picker never destroys existing attribution.
  const options = value && !LEAD_SOURCE_LABELS.includes(value)
    ? [value, ...LEAD_SOURCE_LABELS]
    : LEAD_SOURCE_LABELS

  return (
    <div className="jubo-los-card p-3.5">
      <p className="jubo-los-section-label mb-1.5 flex items-center gap-1.5">
        <Tag className="h-3 w-3" aria-hidden /> Lead Source
        {(busy || loading) && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
      </p>
      {loading ? (
        <p className="text-2xs text-jubo-muted">Loading…</p>
      ) : fieldId ? (
        <>
          <select
            value={value ?? ''}
            onChange={(e) => void save(e.target.value)}
            disabled={busy}
            className="w-full rounded-md border border-jubo-border bg-jubo-card px-2 py-1.5 text-xs text-jubo-text focus:outline-none focus:ring-1 focus:ring-jubo-navy">
            <option value="">No lead source</option>
            {options.map((label) => <option key={label} value={label}>{label}</option>)}
          </select>
          <p className="mt-1.5 text-2xs text-jubo-muted">Where this contact came from — powers source reporting.</p>
        </>
      ) : (
        <>
          <p className="text-2xs text-jubo-muted">Lead-source tracking isn’t set up on this board yet.</p>
          <button
            onClick={() => void setUp()}
            disabled={busy}
            className="mt-2 rounded-md border border-jubo-border px-2.5 py-1 text-2xs font-semibold text-jubo-text transition-colors hover:bg-jubo-card disabled:opacity-60">
            Set up lead source on this board
          </button>
          <p className="mt-1.5 text-2xs text-jubo-muted">Adds one hidden select field — no records are changed.</p>
        </>
      )}
      {error && <p className="mt-1.5 text-2xs font-medium text-jubo-red">{error}</p>}
    </div>
  )
}
