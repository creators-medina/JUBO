'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreVertical, Check, Globe, Eye, Pencil, Copy, Trash2, Type, ChevronRight, Loader2, AlertTriangle, Link2 } from 'lucide-react'
import {
  setFieldGroupVisibility, deleteField, duplicateField, changeFieldType, previewFieldTypeChange,
  getCommonFieldKeys, setFieldCommonKey, clearFieldCommonKey,
} from '@/features/fields/actions'
import { COLUMN_TYPE_OPTIONS } from '@/features/fields/conversion'
import { isTypeCompatible, isFieldEligibleForCommon, SCOPE_LABELS, type CommonFieldKey } from '@/features/fields/commonFields'
import type { FieldType } from '@/types/database'

interface Props {
  field: { id: string; name: string; field_type: FieldType; is_default_status?: boolean; common_field_key_id?: string | null }
  boardId: string
  groupId: string
  isCommon: boolean
  /** Common keys already claimed by OTHER fields on this board (Decision 6). */
  usedCommonKeyIds?: Set<string>
  onStartRename: () => void
}

/**
 * Phase 35F — full column management menu. Rename / Change type / Duplicate /
 * Delete, plus the Phase 35B visibility controls. Confirmation for delete; a
 * data-loss warning before lossy type changes. The default workflow status
 * field hides Change-type + Delete (its type is fixed and it can't be removed).
 */
export function ColumnMenu({ field, boardId, groupId, isCommon, usedCommonKeyIds, onStartRename }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [showTypes, setShowTypes] = useState(false)
  const [showCommon, setShowCommon] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [warn, setWarn] = useState<{ toType: FieldType; total: number; lost: number } | null>(null)
  const [keys, setKeys] = useState<CommonFieldKey[] | null>(null)
  const [pending, startTransition] = useTransition()
  const ref = useRef<HTMLDivElement>(null)

  const isDefaultStatus = field.is_default_status === true
  const commonEligible = isFieldEligibleForCommon(field)
  const currentKey = keys?.find((k) => k.id === field.common_field_key_id) ?? null

  // Lazy-load the registry when the menu opens (only for eligible fields).
  useEffect(() => {
    if (!open || !commonEligible || keys !== null) return
    getCommonFieldKeys().then(setKeys).catch(() => setKeys([]))
  }, [open, commonEligible, keys])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const close = () => { setOpen(false); setShowTypes(false) }
  const fail = (e: unknown, msg: string) => alert(e instanceof Error ? e.message : msg)

  const setVisibility = (mode: 'all' | 'only') => {
    close()
    startTransition(async () => {
      try { await setFieldGroupVisibility({ fieldId: field.id, boardId, mode, groupId }); router.refresh() }
      catch (e) { fail(e, 'Could not update visibility') }
    })
  }

  const onDuplicate = () => {
    close()
    startTransition(async () => {
      try { await duplicateField(field.id, boardId); router.refresh() }
      catch (e) { fail(e, 'Could not duplicate column') }
    })
  }

  const onPickCommonKey = (keyId: string) => {
    if (keyId === field.common_field_key_id) { close(); return }
    // UI-only warning when reassigning an already-set key (never touches values).
    if (field.common_field_key_id && !confirm('Change the common field for this column? This won’t modify any data.')) return
    close()
    startTransition(async () => {
      try { await setFieldCommonKey({ fieldId: field.id, boardId, keyId }); router.refresh() }
      catch (e) { fail(e, 'Could not set common field') }
    })
  }

  const onClearCommonKey = () => {
    if (field.common_field_key_id && !confirm('Clear the common field for this column? This won’t modify any data.')) return
    close()
    startTransition(async () => {
      try { await clearFieldCommonKey({ fieldId: field.id, boardId }); router.refresh() }
      catch (e) { fail(e, 'Could not clear common field') }
    })
  }

  const onPickType = (toType: FieldType) => {
    if (toType === field.field_type) { close(); return }
    close()
    startTransition(async () => {
      try {
        const { total, lost } = await previewFieldTypeChange(field.id, toType)
        if (lost > 0) { setWarn({ toType, total, lost }); return }
        await changeFieldType({ fieldId: field.id, boardId, toType })
        router.refresh()
      } catch (e) { fail(e, 'Could not change type') }
    })
  }

  const confirmTypeChange = () => {
    if (!warn) return
    const toType = warn.toType
    setWarn(null)
    startTransition(async () => {
      try { await changeFieldType({ fieldId: field.id, boardId, toType }); router.refresh() }
      catch (e) { fail(e, 'Could not change type') }
    })
  }

  const onDelete = () => {
    setConfirmDelete(false)
    startTransition(async () => {
      try { await deleteField(field.id, boardId); router.refresh() }
      catch (e) { fail(e, 'Could not delete column') }
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="p-0.5 rounded text-muted-foreground opacity-0 group-hover/col:opacity-100 hover:text-foreground hover:bg-surface-2 transition-opacity"
        title="Column menu"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <MoreVertical className="h-3 w-3" />}
      </button>

      {open && (
        <div className="absolute left-0 top-5 z-40 w-52 rounded-lg border border-border bg-card p-1 shadow-xl">
          <MenuItem icon={Pencil} label="Rename" onClick={() => { close(); onStartRename() }} />

          {!isDefaultStatus && (
            <div
              className="relative"
              onMouseEnter={() => setShowTypes(true)}
              onMouseLeave={() => setShowTypes(false)}
            >
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal text-foreground hover:bg-surface-1"
              >
                <Type className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1">Change type</span>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </button>
              {showTypes && (
                <div className="absolute left-full top-0 z-50 ml-0.5 max-h-72 w-40 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl">
                  {COLUMN_TYPE_OPTIONS.map((t) => (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => onPickType(t.value)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal text-foreground hover:bg-surface-1"
                    >
                      <span className="flex-1">{t.label}</span>
                      {field.field_type === t.value && <Check className="h-3 w-3 text-primary" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <MenuItem icon={Copy} label="Duplicate" onClick={onDuplicate} />

          {commonEligible && (
            <div
              className="relative"
              onMouseEnter={() => setShowCommon(true)}
              onMouseLeave={() => setShowCommon(false)}
            >
              <button type="button" className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal text-foreground hover:bg-surface-1">
                <Link2 className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
                <span className="flex-1">Common field</span>
                {currentKey && <span className="text-[10px] text-primary">{currentKey.label}</span>}
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              </button>
              {showCommon && (
                <div className="absolute left-full top-0 z-50 ml-0.5 max-h-72 w-52 overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-xl">
                  {currentKey && (
                    <div className="px-2 py-1 text-[10px] text-muted-foreground">
                      Mapped: <span className="text-primary">{currentKey.label}</span> · {SCOPE_LABELS[currentKey.scope]}
                    </div>
                  )}
                  {keys === null ? (
                    <div className="flex items-center gap-2 px-2 py-1.5 text-2xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>
                  ) : (
                    (() => {
                      const compatible = keys.filter((k) => isTypeCompatible(field.field_type, k.data_type))
                      if (compatible.length === 0) return <div className="px-2 py-1.5 text-2xs text-muted-foreground">No compatible keys.</div>
                      return compatible.map((k) => {
                        const usedElsewhere = (usedCommonKeyIds?.has(k.id) ?? false) && k.id !== field.common_field_key_id
                        const isCurrent = k.id === field.common_field_key_id
                        return (
                          <button
                            key={k.id}
                            type="button"
                            disabled={usedElsewhere}
                            onClick={() => onPickCommonKey(k.id)}
                            title={usedElsewhere ? `${k.label} is already mapped on this board` : undefined}
                            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal text-foreground hover:bg-surface-1 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <span className="flex-1">{k.label} <span className="text-muted-foreground">· {SCOPE_LABELS[k.scope]}</span></span>
                            {isCurrent && <Check className="h-3 w-3 text-primary" />}
                          </button>
                        )
                      })
                    })()
                  )}
                  {currentKey && (
                    <>
                      <div className="my-1 border-t border-border" />
                      <button type="button" onClick={onClearCommonKey} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal text-destructive hover:bg-surface-1">
                        Clear common key
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {!isDefaultStatus && (
            <MenuItem icon={Trash2} label="Delete" destructive onClick={() => { close(); setConfirmDelete(true) }} />
          )}

          <div className="my-1 border-t border-border" />

          <MenuItem icon={Globe} label="Show in all groups" onClick={() => setVisibility('all')} trailing={isCommon ? <Check className="h-3 w-3 text-primary" /> : undefined} />
          <MenuItem icon={Eye} label="Show only in this group" onClick={() => setVisibility('only')} trailing={!isCommon ? <Check className="h-3 w-3 text-primary" /> : undefined} />
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <Overlay onClose={() => setConfirmDelete(false)}>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-destructive/10"><Trash2 className="h-3.5 w-3.5 text-destructive" /></div>
            <h3 className="text-sm font-semibold text-foreground">Delete column “{field.name}”?</h3>
          </div>
          <p className="mb-1 text-xs text-muted-foreground">This will permanently delete:</p>
          <ul className="mb-3 list-disc pl-5 text-xs text-muted-foreground">
            <li>the column definition</li>
            <li>all of its field values</li>
            <li>its visibility rules</li>
            <li>its checklist / requirement settings</li>
          </ul>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="button" onClick={onDelete} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:bg-destructive/90">Delete</button>
          </div>
        </Overlay>
      )}

      {/* Lossy type-change warning */}
      {warn && (
        <Overlay onClose={() => setWarn(null)}>
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10"><AlertTriangle className="h-3.5 w-3.5 text-amber-400" /></div>
            <h3 className="text-sm font-semibold text-foreground">Some values may be lost</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            {warn.lost} of {warn.total} value{warn.total === 1 ? '' : 's'} can’t convert to the new type and will be cleared. Continue?
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setWarn(null)} className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            <button type="button" onClick={confirmTypeChange} className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-black hover:bg-amber-400">Continue</button>
          </div>
        </Overlay>
      )}
    </div>
  )
}

function MenuItem({ icon: Icon, label, onClick, destructive, trailing }: {
  icon: React.ElementType; label: string; onClick: () => void; destructive?: boolean; trailing?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-2xs normal-case tracking-normal hover:bg-surface-1 ${destructive ? 'text-destructive' : 'text-foreground'}`}
    >
      <Icon className={`h-3 w-3 flex-shrink-0 ${destructive ? 'text-destructive' : 'text-muted-foreground'}`} />
      <span className="flex-1">{label}</span>
      {trailing}
    </button>
  )
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-4 shadow-xl normal-case tracking-normal" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
