'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Command } from 'cmdk'
import { ChevronDown, Plus, Check, Ban, Star, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { TITLE_TARGET, type InferredType, type MappingMetadata, type TargetField } from '../types'
import type { FieldType } from '@/types/database'

const CREATABLE: { type: FieldType; label: string }[] = [
  { type: 'text', label: 'Text' }, { type: 'textarea', label: 'Long text' }, { type: 'number', label: 'Number' },
  { type: 'currency', label: 'Currency' }, { type: 'date', label: 'Date' }, { type: 'email', label: 'Email' },
  { type: 'phone', label: 'Phone' }, { type: 'url', label: 'Link' }, { type: 'boolean', label: 'Yes / No' }, { type: 'select', label: 'Select' },
]
const TYPE_REASON: Record<string, string> = {
  email: 'Looks like emails', phone: 'Looks like phone numbers', currency: 'Looks like currency',
  number: 'Looks like numbers', date: 'Looks like dates', url: 'Looks like links',
  boolean: 'Looks like yes/no', text: 'Mostly text values',
}

function ConfidenceBadge({ meta }: { meta?: MappingMetadata }) {
  if (!meta || meta.reason === 'skipped') return null
  const { reason, confidence } = meta
  const label =
    reason === 'manual' ? 'Manual' : reason === 'created' ? 'New field' :
    reason === 'matched-by-header' ? 'Matched by header' : reason === 'synonym' ? 'Matched by name' :
    reason === 'type-detected' ? 'Detected by values' : confidence >= 0.8 ? 'Strong match' : confidence >= 0.5 ? 'Possible match' : 'Needs review'
  const tone = reason === 'manual' || reason === 'created' ? 'text-jubo-navy bg-jubo-navy/10'
    : confidence >= 0.8 ? 'text-jubo-green bg-jubo-green-soft'
    : confidence >= 0.5 ? 'text-jubo-gold bg-jubo-gold-soft'
    : 'text-muted-foreground bg-surface-2'
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', tone)}>{label}</span>
}

export function FieldMappingControl({
  value, fields, columnHeader, inferred, meta, titleTaken, onChange, onCreateField,
}: {
  value: string
  fields: TargetField[]
  columnHeader: string
  inferred: InferredType
  meta?: MappingMetadata
  titleTaken: boolean
  onChange: (target: string) => void
  onCreateField: (name: string, fieldType: FieldType) => Promise<TargetField | null>
}) {
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<DOMRect | null>(null)
  const [mode, setMode] = useState<'list' | 'create'>('list')
  const [newName, setNewName] = useState(columnHeader)
  const [newType, setNewType] = useState<FieldType>(CREATABLE.some((c) => c.type === inferred.type) ? inferred.type : 'text')
  const [busy, setBusy] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (triggerRef.current && !triggerRef.current.contains(e.target as Node)) setOpen(false) }
    const onScroll = () => setOpen(false)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => document.addEventListener('mousedown', close), 0)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('keydown', onKey)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', close); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('keydown', onKey) }
  }, [open])

  const openPanel = () => {
    setRect(triggerRef.current?.getBoundingClientRect() ?? null)
    setMode('list'); setNewName(columnHeader)
    setNewType(CREATABLE.some((c) => c.type === inferred.type) ? inferred.type : 'text')
    setOpen(true)
  }

  const triggerLabel = value === '' ? 'Ignore this column'
    : value === TITLE_TARGET ? '★ Record name'
    : fields.find((f) => f.id === value)?.name ?? 'Select…'

  const select = (target: string) => { onChange(target); setOpen(false) }

  const create = async () => {
    if (!newName.trim() || busy) return
    setBusy(true)
    const f = await onCreateField(newName.trim(), newType)
    setBusy(false)
    if (f) { onChange(f.id); setOpen(false) }
  }

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => (open ? setOpen(false) : openPanel())}
        className={cn('flex w-full items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-sm transition-colors',
          value ? 'border-border text-foreground' : 'border-dashed border-border text-muted-foreground')}>
        <span className="flex-1 truncate">{triggerLabel}</span>
        <ConfidenceBadge meta={value ? meta : undefined} />
        <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
      </button>

      {open && rect && typeof document !== 'undefined' && createPortal(
        <div style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: Math.max(rect.width, 256), zIndex: 60 }}
          className="rounded-lg border border-border bg-card shadow-2xl">
          {mode === 'list' ? (
            <Command className="overflow-hidden">
              <Command.Input autoFocus placeholder="Search fields…" className="w-full border-b border-border bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none" />
              <Command.List className="max-h-64 overflow-y-auto p-1">
                <Command.Empty className="px-2 py-3 text-center text-xs text-muted-foreground">No matching field</Command.Empty>
                <Command.Group heading="System" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                  <Item onSelect={() => select('')} icon={Ban} label="Ignore this column" active={value === ''} />
                  {!(titleTaken && value !== TITLE_TARGET) && <Item onSelect={() => select(TITLE_TARGET)} icon={Star} label="Record name" active={value === TITLE_TARGET} />}
                </Command.Group>
                <Command.Group heading="Fields" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground">
                  {fields.map((f) => <Item key={f.id} value={f.name} onSelect={() => select(f.id)} icon={Check} label={f.name} active={value === f.id} />)}
                </Command.Group>
              </Command.List>
              <button type="button" onClick={() => setMode('create')}
                className="flex w-full items-center gap-2 border-t border-border px-3 py-2 text-left text-sm text-jubo-navy hover:bg-surface-1">
                <Plus className="h-3.5 w-3.5" /> Create a field for “{columnHeader}”
              </button>
            </Command>
          ) : (
            <div className="space-y-2.5 p-3">
              <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">New field</p>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus placeholder="Field name"
                className="w-full rounded-md border border-border bg-surface-1 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy" />
              <div>
                <select value={newType} onChange={(e) => setNewType(e.target.value as FieldType)}
                  className="w-full rounded-md border border-border bg-surface-1 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy">
                  {CREATABLE.map((c) => <option key={c.type} value={c.type}>{c.label}</option>)}
                </select>
                <p className="mt-1 text-2xs text-muted-foreground">{TYPE_REASON[inferred.type] ? `Suggested: ${TYPE_REASON[inferred.type]}` : 'Pick the type that fits this column'}</p>
              </div>
              <div className="flex justify-end gap-2 pt-0.5">
                <button type="button" onClick={() => setMode('list')} className="rounded-md px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">Back</button>
                <button type="button" onClick={create} disabled={busy || !newName.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create &amp; map
                </button>
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  )
}

function Item({ value, onSelect, icon: Icon, label, active }: { value?: string; onSelect: () => void; icon: React.ElementType; label: string; active: boolean }) {
  return (
    <Command.Item value={value ?? label} onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground data-[selected=true]:bg-surface-1">
      <Icon className={cn('h-3.5 w-3.5 flex-shrink-0', active ? 'text-jubo-navy' : 'text-muted-foreground')} />
      <span className="flex-1 truncate">{label}</span>
      {active && <Check className="h-3.5 w-3.5 flex-shrink-0 text-jubo-navy" />}
    </Command.Item>
  )
}
