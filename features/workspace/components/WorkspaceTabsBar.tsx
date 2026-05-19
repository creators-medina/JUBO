'use client'

import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useWorkspaceTabs } from '../providers/WorkspaceTabsProvider'

/**
 * Top tab strip for the workspace overlay. Renders nothing when no records
 * are open — the parent panel handles its own visibility, but the strip
 * stays hidden if there's nothing to switch between.
 */
export function WorkspaceTabsBar() {
  const { tabs, activeRecordId, activateWorkspace, closeWorkspace } = useWorkspaceTabs()

  if (tabs.length === 0) return null

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-surface-1/40 overflow-x-auto">
      {tabs.map(t => {
        const active = t.recordId === activeRecordId
        return (
          <div
            key={t.recordId}
            onClick={() => activateWorkspace(t.recordId)}
            className={cn(
              'group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs cursor-pointer transition-colors flex-shrink-0 max-w-[200px]',
              active
                ? 'bg-card border border-border text-foreground'
                : 'text-muted-foreground hover:bg-surface-2 hover:text-foreground border border-transparent',
            )}
          >
            <span className="truncate">{t.title}</span>
            <button
              onClick={(e) => { e.stopPropagation(); closeWorkspace(t.recordId) }}
              className={cn(
                'p-0.5 rounded hover:bg-surface-3 hover:text-foreground transition-opacity flex-shrink-0',
                active ? 'opacity-70 hover:opacity-100' : 'opacity-0 group-hover:opacity-70',
              )}
              title="Close tab"
            >
              <X className="w-2.5 h-2.5" />
            </button>
          </div>
        )
      })}
    </div>
  )
}
