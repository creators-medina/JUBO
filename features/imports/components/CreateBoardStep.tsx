'use client'

import { Sparkles, Layers, Tag, Phone, Mail, CheckCircle2, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FieldType } from '@/types/database'
import type { BoardSuggestion, ProposedField, GroupSuggestion } from '../inference/boardInference'

const CREATABLE_TYPES: FieldType[] = ['text', 'email', 'phone', 'currency', 'number', 'date', 'url', 'boolean', 'select']

const TYPE_LABEL: Partial<Record<FieldType, string>> = {
  text: 'Text', email: 'Email', phone: 'Phone', currency: 'Currency', number: 'Number',
  date: 'Date', url: 'Link', boolean: 'Yes / No', select: 'Choice',
}

export function CreateBoardStep({
  fileName,
  rowsCount,
  columnsCount,
  suggestion,
  name,
  setName,
  proposedFields,
  groupColumnIndex,
  onToggleField,
  onFieldName,
  onFieldType,
  groupSuggestion,
  createGroups,
  setCreateGroups,
}: {
  fileName: string
  rowsCount: number
  columnsCount: number
  suggestion: BoardSuggestion
  name: string
  setName: (v: string) => void
  proposedFields: ProposedField[]
  /** When grouping is on, this column drives groups (it's not also a field). */
  groupColumnIndex: number | null
  onToggleField: (columnIndex: number) => void
  onFieldName: (columnIndex: number, name: string) => void
  onFieldType: (columnIndex: number, fieldType: FieldType) => void
  groupSuggestion: GroupSuggestion | null
  createGroups: boolean
  setCreateGroups: (v: boolean) => void
}) {
  const includedFieldCount = proposedFields.filter((f) => f.include && f.columnIndex !== groupColumnIndex).length
  const groupCount = createGroups && groupSuggestion ? groupSuggestion.values.length : 1
  const hasPhone = proposedFields.some((f) => f.fieldType === 'phone')
  const hasEmail = proposedFields.some((f) => f.fieldType === 'email')
  const blankIncluded = proposedFields.filter((f) => f.include && f.columnIndex !== groupColumnIndex && !f.name.trim())

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-primary" /> We analyzed your file
        </h2>
        <p className="text-sm text-muted-foreground">
          {fileName} · {rowsCount.toLocaleString()} record{rowsCount === 1 ? '' : 's'} · {columnsCount} column{columnsCount === 1 ? '' : 's'}
        </p>
      </div>

      {/* What Jubo will build */}
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="mb-3 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">We&apos;ll create</p>
        <label className="block">
          <span className="mb-1.5 block text-xs font-medium text-foreground">Board name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-1 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary">
            <Layers className="h-3 w-3" /> {suggestion.typeLabel}
          </span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{includedFieldCount} field{includedFieldCount === 1 ? '' : 's'}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{groupCount} group{groupCount === 1 ? '' : 's'}</span>
        </div>
      </div>

      {/* Trust bullets */}
      <div className="rounded-xl border border-border bg-surface-1 p-4">
        <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-muted-foreground">We detected</p>
        <ul className="space-y-1.5 text-sm text-foreground">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
            <span>{rowsCount.toLocaleString()} record{rowsCount === 1 ? '' : 's'} across {columnsCount} column{columnsCount === 1 ? '' : 's'}.</span>
          </li>
          {suggestion.confidence >= 0.5 && (
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-400" />
              <span>This looks like {suggestion.typeLabel.toLowerCase()} ({suggestion.reason}).</span>
            </li>
          )}
          {hasPhone && (
            <li className="flex items-start gap-2">
              <Phone className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span>Phone numbers — you&apos;ll be able to call right from Jubo.</span>
            </li>
          )}
          {hasEmail && (
            <li className="flex items-start gap-2">
              <Mail className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span>Email addresses.</span>
            </li>
          )}
          {groupSuggestion && (
            <li className="flex items-start gap-2">
              <Tag className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
              <span>
                A <span className="font-medium">{groupSuggestion.header}</span> column — we can turn it into{' '}
                {groupSuggestion.values.length} group{groupSuggestion.values.length === 1 ? '' : 's'}{' '}
                {groupSuggestion.values.length > 0 ? `(${groupSuggestion.values.slice(0, 3).join(', ')}${groupSuggestion.values.length > 3 ? '…' : ''}).` : '.'}
              </span>
            </li>
          )}
        </ul>
      </div>

      {/* Groups toggle + preview */}
      {groupSuggestion && (
        <div className="rounded-xl border border-border bg-card p-4">
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={createGroups}
              onChange={(e) => setCreateGroups(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border bg-surface-1 text-primary focus:ring-primary"
            />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Create groups from <span className="text-primary">{groupSuggestion.header}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                Records will be sorted into these groups automatically.
              </p>
              {createGroups && (
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {groupSuggestion.values.map((v) => (
                    <span key={v} className="rounded-full border border-border bg-surface-1 px-2 py-0.5 text-2xs text-foreground">
                      {v}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </label>
        </div>
      )}

      {/* Blank-header warning — surfaced ABOVE the fields card so it's the first thing the user sees. */}
      {blankIncluded.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-medium">
              {blankIncluded.length} column{blankIncluded.length === 1 ? '' : 's'} had no header.
            </p>
            <p className="mt-0.5 text-xs text-amber-200/80">
              Name them below or uncheck to skip. We won&apos;t create a board with unnamed columns.
            </p>
          </div>
        </div>
      )}

      {/* Fields review */}
      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">Fields ({includedFieldCount})</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Edit names, change types, or uncheck anything you don&apos;t need.</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {proposedFields.map((f) => {
            const isGroupCol = f.columnIndex === groupColumnIndex
            const blankIncludedField = !isGroupCol && f.include && !f.name.trim()
            return (
              <div
                key={f.columnIndex}
                className={cn(
                  'flex items-center gap-3 border-b border-border/60 px-4 py-2.5 last:border-b-0',
                  isGroupCol && 'opacity-60',
                  blankIncludedField && 'bg-amber-500/5',
                )}
              >
                <input
                  type="checkbox"
                  checked={!isGroupCol && f.include}
                  disabled={isGroupCol}
                  onChange={() => onToggleField(f.columnIndex)}
                  className="h-4 w-4 rounded border-border bg-surface-1 text-primary focus:ring-primary"
                />
                <div className="min-w-0 flex-1">
                  <input
                    value={f.name}
                    placeholder={blankIncludedField ? 'Name this column' : ''}
                    onChange={(e) => onFieldName(f.columnIndex, e.target.value)}
                    disabled={isGroupCol || !f.include}
                    className={cn(
                      'w-full bg-transparent text-sm text-foreground focus:outline-none disabled:text-muted-foreground',
                      blankIncludedField && 'placeholder:text-amber-300/80',
                    )}
                  />
                  <p className="text-2xs text-muted-foreground">
                    {f.header.trim()
                      ? <>from &ldquo;{f.header}&rdquo;{isGroupCol && ' · used for groups'}</>
                      : <span className="text-amber-300/80">no header in the file{isGroupCol && ' · used for groups'}</span>}
                  </p>
                </div>
                {!isGroupCol && (
                  <select
                    value={f.fieldType}
                    disabled={!f.include}
                    onChange={(e) => onFieldType(f.columnIndex, e.target.value as FieldType)}
                    className="rounded-md border border-border bg-surface-1 px-2 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary disabled:text-muted-foreground"
                  >
                    {CREATABLE_TYPES.map((t) => (
                      <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
