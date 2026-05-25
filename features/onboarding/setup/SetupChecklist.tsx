'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import * as Icons from 'lucide-react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { setChecklistItemCompleted } from '../actions'
import type { SetupChecklistItemRow } from '../types'

function Icon({ name, className }: { name: string | null; className?: string }) {
  const C = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name ?? 'Circle'] ?? Icons.Circle
  return <C className={className} />
}

export function SetupChecklist({
  items,
  compact = false,
}: {
  items: SetupChecklistItemRow[]
  compact?: boolean
}) {
  const [local, setLocal] = useState(items)
  const [, startTransition] = useTransition()

  if (local.length === 0) return null

  const completed = local.filter((i) => i.completed).length
  const pct = Math.round((completed / local.length) * 100)

  const toggle = (item: SetupChecklistItemRow) => {
    const next = !item.completed
    setLocal((arr) => arr.map((i) => (i.id === item.id ? { ...i, completed: next } : i)))
    startTransition(async () => {
      try {
        await setChecklistItemCompleted(item.id, next)
      } catch {
        setLocal((arr) => arr.map((i) => (i.id === item.id ? { ...i, completed: !next } : i)))
      }
    })
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card', compact ? 'p-4' : 'p-5')}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">Finish setting up</p>
          <p className="text-xs text-muted-foreground">
            {completed} of {local.length} complete
          </p>
        </div>
        <div className="text-right">
          <span className="text-lg font-semibold text-foreground">{pct}%</span>
        </div>
      </div>

      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>

      <ul className="space-y-1">
        {local.map((item) => (
          <li
            key={item.id}
            className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-1"
          >
            <button
              type="button"
              onClick={() => toggle(item)}
              className={cn(
                'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border transition-colors',
                item.completed
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-transparent hover:border-primary',
              )}
              aria-label={item.completed ? 'Mark incomplete' : 'Mark complete'}
            >
              <Check className="h-3 w-3" />
            </button>
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Icon name={item.icon} className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p
                  className={cn(
                    'truncate text-sm',
                    item.completed ? 'text-muted-foreground line-through' : 'text-foreground',
                  )}
                >
                  {item.title}
                </p>
                {!compact && item.description && (
                  <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                )}
              </div>
            </div>
            {item.action_href && !item.completed && (
              <Link
                href={item.action_href}
                className="flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium text-primary opacity-0 transition-opacity hover:underline group-hover:opacity-100"
              >
                Do it
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
