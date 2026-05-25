'use client'

import { cn } from '@/lib/utils'
import { TITLE_TARGET, type ColumnMapping, type TargetField } from '../types'

const TYPE_LABEL: Record<string, string> = {
  email: 'Email', phone: 'Phone', currency: 'Currency', number: 'Number',
  date: 'Date', datetime: 'Date', boolean: 'Yes/No', text: 'Text', url: 'URL',
  select: 'Select', multiselect: 'Tags', tags: 'Tags', rating: 'Rating',
}

export function MappingTable({
  mappings,
  fields,
  sampleRow,
  onChange,
}: {
  mappings: ColumnMapping[]
  fields: TargetField[]
  sampleRow: string[]
  onChange: (columnIndex: number, target: string) => void
}) {
  const titleUsed = mappings.some((m) => m.target === TITLE_TARGET)

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="grid grid-cols-[1.4fr_1fr_1.4fr] gap-2 border-b border-border bg-surface-1 px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
        <span>Column</span>
        <span>Sample</span>
        <span>Maps to</span>
      </div>
      <div className="max-h-[46vh] divide-y divide-border overflow-y-auto">
        {mappings.map((m) => {
          const sample = sampleRow[m.columnIndex] ?? ''
          const mapped = m.target !== ''
          return (
            <div key={m.columnIndex} className="grid grid-cols-[1.4fr_1fr_1.4fr] items-center gap-2 px-4 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{m.header}</p>
                <span className="text-2xs text-muted-foreground">{TYPE_LABEL[m.inferred.type] ?? m.inferred.type}</span>
              </div>
              <p className="truncate text-xs text-muted-foreground">{sample || <span className="opacity-40">—</span>}</p>
              <div className="flex items-center gap-2">
                <select
                  value={m.target}
                  onChange={(e) => onChange(m.columnIndex, e.target.value)}
                  className={cn(
                    'w-full rounded-md border bg-surface-1 px-2 py-1.5 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary',
                    mapped ? 'border-border' : 'border-dashed border-border text-muted-foreground',
                  )}
                >
                  <option value="">Ignore this column</option>
                  <option value={TITLE_TARGET} disabled={titleUsed && m.target !== TITLE_TARGET}>
                    ★ Record name {titleUsed && m.target !== TITLE_TARGET ? '(taken)' : ''}
                  </option>
                  <optgroup label="Fields">
                    {fields.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
