'use client'

import { cn } from '@/lib/utils'
import { TITLE_TARGET, type ColumnMapping, type RowMatch } from '../types'

export function PreviewTable({
  mappings,
  rows,
  matchByRow,
  limit = 50,
}: {
  mappings: ColumnMapping[]
  rows: string[][]
  matchByRow: Map<number, RowMatch>
  limit?: number
}) {
  // Only columns that will actually import (title + mapped fields).
  const cols = mappings.filter((m) => m.target !== '')
  const preview = rows.slice(0, limit)

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="max-h-[44vh] overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-surface-1">
            <tr className="text-left text-2xs font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-semibold">Status</th>
              {cols.map((c) => (
                <th key={c.columnIndex} className="whitespace-nowrap px-3 py-2 font-semibold">
                  {c.target === TITLE_TARGET ? 'Record name' : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {preview.map((row, i) => {
              const match = matchByRow.get(i)
              const dup = match?.isDuplicate
              return (
                <tr key={i} className="hover:bg-surface-1">
                  <td className="px-3 py-2">
                    <span
                      className={cn(
                        'inline-flex items-center rounded px-1.5 py-0.5 text-2xs font-medium',
                        dup ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400',
                      )}
                    >
                      {dup ? `Dupe · ${match?.matchedOn}` : 'New'}
                    </span>
                  </td>
                  {cols.map((c) => (
                    <td key={c.columnIndex} className="max-w-[200px] truncate px-3 py-2 text-foreground">
                      {row[c.columnIndex] ?? ''}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <div className="border-t border-border bg-surface-1 px-3 py-2 text-2xs text-muted-foreground">
          Showing first {limit} of {rows.length} rows
        </div>
      )}
    </div>
  )
}
