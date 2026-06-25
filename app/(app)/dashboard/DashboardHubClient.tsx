'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutDashboard, Plus } from 'lucide-react'
import { CreateDashboardModal } from '@/features/dashboards/components/CreateDashboardModal'

interface DashboardHubClientProps {
  organizationId: string
  orgName: string
}

export function DashboardHubClient({ organizationId, orgName }: DashboardHubClientProps) {
  const router = useRouter()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-border flex-shrink-0">
        <h1 className="text-base font-semibold text-foreground">{orgName}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Your command center</p>
      </div>

      {/* Empty state */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-surface-1 border border-border flex items-center justify-center">
          <LayoutDashboard className="w-7 h-7 text-muted-foreground" />
        </div>

        <div className="space-y-2 max-w-sm">
          <h2 className="text-lg font-semibold text-foreground">Build your command center</h2>
          <p className="text-sm text-muted-foreground">
            Dashboards display widgets that pull live data from your boards —
            giving you real-time visibility into what matters.
          </p>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create First Dashboard
        </button>

        {/* Inspiration tiles */}
        <div className="grid grid-cols-3 gap-3 mt-4 max-w-lg w-full">
          {[
            { icon: '🏆', label: 'Sales Dashboard' },
            { icon: '📊', label: 'Pipeline Health' },
            { icon: '⚡', label: 'Daily Priorities' },
          ].map(tile => (
            <button
              key={tile.label}
              onClick={() => setShowCreate(true)}
              className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border bg-card hover:bg-surface-1 hover:border-jubo-navy/30 transition-all group"
            >
              <span className="text-2xl">{tile.icon}</span>
              <span className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">
                {tile.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {showCreate && (
        <CreateDashboardModal
          organizationId={organizationId}
          onClose={() => setShowCreate(false)}
          onSuccess={(id) => {
            setShowCreate(false)
            router.push(`/dashboards/${id}`)
          }}
        />
      )}
    </div>
  )
}
