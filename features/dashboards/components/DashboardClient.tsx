'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LayoutDashboard } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WidgetRenderer } from '@/features/widgets/components/WidgetRenderer'
import { AddWidgetModal } from './AddWidgetModal'
import { removeWidget } from '../actions'
import type { DashboardRow, DashboardWidgetRow, WidgetData } from '@/features/widgets/types'

const GRID_COL_CLASS: Record<number, string> = {
  1: 'col-span-12 lg:col-span-3',
  2: 'col-span-12 lg:col-span-6',
  3: 'col-span-12 lg:col-span-9',
  4: 'col-span-12',
}

const MIN_HEIGHT: Record<string, string> = {
  metric:        'min-h-[140px]',
  list:          'min-h-[240px]',
  board_summary: 'min-h-[200px]',
}

interface DashboardClientProps {
  dashboard: DashboardRow
  widgets: DashboardWidgetRow[]
  widgetData: Record<string, WidgetData>
  boards: Array<{ id: string; name: string }>
}

export function DashboardClient({ dashboard, widgets, widgetData, boards }: DashboardClientProps) {
  const router = useRouter()
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [, startTransition] = useTransition()

  const handleRemove = (widgetId: string) => {
    startTransition(async () => {
      await removeWidget(widgetId, dashboard.id)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Dashboard header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-3">
          {dashboard.icon ? (
            <span className="text-2xl leading-none">{dashboard.icon}</span>
          ) : (
            <LayoutDashboard className="w-5 h-5 text-muted-foreground" />
          )}
          <div>
            <h1 className="text-base font-semibold text-foreground">{dashboard.name}</h1>
            {dashboard.description && (
              <p className="text-xs text-muted-foreground">{dashboard.description}</p>
            )}
          </div>
        </div>

        <button
          onClick={() => setShowAddWidget(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Widget
        </button>
      </div>

      {/* Widget grid */}
      <div className="flex-1 overflow-auto p-6">
        {widgets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-surface-1 flex items-center justify-center">
              <LayoutDashboard className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">No widgets yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Add your first widget to start building this dashboard.
              </p>
            </div>
            <button
              onClick={() => setShowAddWidget(true)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Widget
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-12 gap-4 auto-rows-min">
            {widgets.map(widget => {
              const data = widgetData[widget.id] ?? { type: 'error' as const, message: 'No data' }
              return (
                <div
                  key={widget.id}
                  className={cn(
                    GRID_COL_CLASS[widget.width] ?? 'col-span-12 lg:col-span-6',
                    MIN_HEIGHT[widget.widget_type] ?? 'min-h-[180px]',
                  )}
                >
                  <WidgetRenderer
                    widget={widget}
                    data={data}
                    onRemove={() => handleRemove(widget.id)}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showAddWidget && (
        <AddWidgetModal
          dashboardId={dashboard.id}
          boards={boards}
          onClose={() => setShowAddWidget(false)}
          onSuccess={() => {
            setShowAddWidget(false)
            router.refresh()
          }}
        />
      )}
    </div>
  )
}
