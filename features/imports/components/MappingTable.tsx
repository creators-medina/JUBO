'use client'

import { AlertTriangle } from 'lucide-react'
import { TITLE_TARGET, type ColumnMapping, type TargetField } from '../types'
import type { FieldType } from '@/types/database'
import { FieldMappingControl } from './FieldMappingControl'

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
  onCreateField,
}: {
  mappings: ColumnMapping[]
  fields: TargetField[]
  sampleRow: string[]
  onChange: (columnIndex: number, target: string) => void
  onCreateField: (columnIndex: number, name: string, fieldType: FieldType) => Promise<TargetField | null>
}) {
  const titleUsed = mappings.some((m) => m.target === TITLE_TARGET)
  const ignored = mappings.filter((m) => m.target === '')

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-border">
        <div className="grid grid-cols-[1.4fr_1fr_1.4fr] gap-2 border-b border-border bg-surface-1 px-4 py-2.5 text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span>Column</span>
          <span>Sample</span>
          <span>Maps to</span>
        </div>
        <div className="max-h-[46vh] divide-y divide-border overflow-y-auto">
          {mappings.map((m) => {
            const sample = sampleRow[m.columnIndex] ?? ''
            return (
              <div key={m.columnIndex} className="grid grid-cols-[1.4fr_1fr_1.4fr] items-center gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{m.header}</p>
                  <span className="text-2xs text-muted-foreground">{TYPE_LABEL[m.inferred.type] ?? m.inferred.type}</span>
                </div>
                <p className="truncate text-xs text-muted-foreground">{sample || <span className="opacity-40">—</span>}</p>
                <FieldMappingControl
                  value={m.target}
                  fields={fields}
                  columnHeader={m.header}
                  inferred={m.inferred}
                  meta={m.meta}
                  titleTaken={titleUsed}
                  onChange={(t) => onChange(m.columnIndex, t)}
                  onCreateField={(name, type) => onCreateField(m.columnIndex, name, type)}
                />
              </div>
            )
          })}
        </div>
      </div>

      {ignored.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-lg border border-jubo-gold/40 bg-jubo-gold-soft px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-jubo-gold" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">{ignored.length} column{ignored.length === 1 ? '' : 's'} will be skipped</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Not importing: {ignored.map((m) => m.header).join(', ')}. Map them — or create a field — so nothing is lost.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
