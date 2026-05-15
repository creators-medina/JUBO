'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LayoutDashboard, Settings2 } from 'lucide-react'
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy } from '@dnd-kit/sortable'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { removeWidget, reorderWidgets } from '../actions'
import { SortableWidgetCard } from './SortableWidgetCard'
import { AddWidgetModal } from './AddWidgetModal'
import { EditWidgetModal } from './EditWidgetModal'
import { DashboardSettingsModal } from './DashboardSettingsModal'
import { RecordDetailDrawer } from '@/features/records/components/RecordDetailDrawer'
import type { DashboardRow, DashboardWidgetRow, WidgetData, SavedViewRow } from '@/features/widgets/types'
import type { ProductionGoalRow } from '@/features/goals/types'

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
  activity_feed: 'min-h-[240px]',
  saved_view:    'min-h-[240px]',
  goal_progress: 'min-h-[200px]',
  funnel_pace:   'min-h-[240px]',
  gap_analysis:  'min-h-[240px]',
}

type DrawerState = {
  recordId: string
  boardId: string
  groups: any[]
}

interface DashboardClientProps {
  dashboard: DashboardRow
  widgets: DashboardWidgetRow[]
  widgetData: Record<string, WidgetData>
  boards: Array<{ id: string; name: string }>
  savedViews: SavedViewRow[]
  productionGoals: ProductionGoalRow[]
  organizationId: string
}

export function DashboardClient({ dashboard, widgets: serverWidgets, widgetData, boards, savedViews, productionGoals, organizationId }: DashboardClientProps) {
  const router = useRouter()
  const [localWidgets, setLocalWidgets] = useState(serverWidgets)
  const [showAddWidget, setShowAddWidget] = useState(false)
  const [editingWidget, setEditingWidget] = useState<DashboardWidgetRow | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [drawerState, setDrawerState] = useState<DrawerState | null>(null)
  const [, startTransition] = useTransition()

  // Sync when server data refreshes (e.g. after router.refresh())
  useEffect(() => { setLocalWidgets(serverWidgets) }, [serverWidgets])

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = localWidgets.findIndex(w => w.id === active.id)
    const newIndex = localWidgets.findIndex(w => w.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(localWidgets, oldIndex, newIndex)
    setLocalWidgets(reordered) // optimistic

    const positions = reordered.map((w, i) => ({ id: w.id, position_y: i }))
    startTransition(async () => {
      try {
        await reorderWidgets(positions, dashboard.id)
      } catch {
        setLocalWidgets(serverWidgets) // rollback
      }
    })
  }

  const handleRemove = (widgetId: string) => {
    startTransition(async () => {
      await removeWidget(widgetId, dashboard.id)
      router.refresh()
    })
  }

  const handleRecordClick = async (recordId: string) => {
    const supabase = createClient()
    const { data: record } = await supabase
      .from('records')
      .select('board_id')
      .eq('id', recordId)
      .single()
    if (!record) return

    const { data: groups } = await supabase
      .from('board_groups')
      .select('*')
      .eq('board_id', record.board_id)
      .eq('is_archived', false)
      .order('position')

    setDrawerState({ recordId, boardId: record.board_id, groups: groups ?? [] })
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

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(true)}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors"
            title="Dashboard settings"
          >
            <Settings2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowAddWidget(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Widget
          </button>
        </div>
      </div>

      {/* Widget grid */}
      <div className="flex-1 overflow-auto p-6">
        {localWidgets.length === 0 ? (
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
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localWidgets.map(w => w.id)} strategy={rectSortingStrategy}>
              <div className="grid grid-cols-12 gap-4 auto-rows-min">
                {localWidgets.map(widget => {
                  const data = widgetData[widget.id] ?? { type: 'error' as const, message: 'No data' }
                  return (
                    <div
                      key={widget.id}
                      className={cn(
                        GRID_COL_CLASS[widget.width] ?? 'col-span-12 lg:col-span-6',
                        MIN_HEIGHT[widget.widget_type] ?? 'min-h-[180px]',
                      )}
                    >
                      <SortableWidgetCard
                        widget={widget}
                        data={data}
                        onRemove={() => handleRemove(widget.id)}
                        onEdit={() => setEditingWidget(widget)}
                        onRecordClick={handleRecordClick}
                      />
                    </div>
                  )
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {showAddWidget && (
        <AddWidgetModal
          dashboardId={dashboard.id}
          boards={boards}
          savedViews={savedViews}
          productionGoals={productionGoals}
          onClose={() => setShowAddWidget(false)}
          onSuccess={() => {
            setShowAddWidget(false)
            router.refresh()
          }}
        />
      )}

      {editingWidget && (
        <EditWidgetModal
          widget={editingWidget}
          boards={boards}
          savedViews={savedViews}
          productionGoals={productionGoals}
          onClose={() => setEditingWidget(null)}
          onSuccess={() => {
            setEditingWidget(null)
            router.refresh()
          }}
        />
      )}

      {showSettings && (
        <DashboardSettingsModal
          dashboard={dashboard}
          onClose={() => setShowSettings(false)}
        />
      )}

      {drawerState && (
        <RecordDetailDrawer
          recordId={drawerState.recordId}
          boardId={drawerState.boardId}
          groups={drawerState.groups}
          organizationId={organizationId}
          onClose={() => setDrawerState(null)}
        />
      )}
    </div>
  )
}
