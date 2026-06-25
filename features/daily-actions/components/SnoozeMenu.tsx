'use client'

import { useState, useRef, useEffect } from 'react'
import { Clock, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

function offsetISO(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface Props {
  onPick: (dueDate: string) => void
  label?: string
  className?: string
  buttonClassName?: string
}

export function SnoozeMenu({ onPick, label = 'Snooze', className, buttonClassName }: Props) {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customDate, setCustomDate] = useState(offsetISO(1))
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false); setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const pick = (days: number) => {
    onPick(offsetISO(days))
    setOpen(false); setShowCustom(false)
  }

  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault()
    onPick(customDate)
    setOpen(false); setShowCustom(false)
  }

  return (
    <div ref={ref} className={cn('relative', className)}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          'inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors',
          buttonClassName,
        )}
      >
        <Clock className="w-3 h-3" />
        {label}
        <ChevronDown className="w-2.5 h-2.5" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-44 bg-card border border-border rounded-lg shadow-xl py-1">
          <Item onClick={() => pick(1)} label="Tomorrow" hint="+1d" />
          <Item onClick={() => pick(3)} label="In 3 days" hint="+3d" />
          <Item onClick={() => pick(7)} label="Next week" hint="+7d" />
          <div className="h-px bg-border my-1" />
          {showCustom ? (
            <form onSubmit={submitCustom} className="px-2 py-1.5 flex items-center gap-1.5">
              <input
                type="date"
                value={customDate}
                onChange={e => setCustomDate(e.target.value)}
                autoFocus
                className="flex-1 px-1.5 py-1 rounded bg-surface-1 border border-border text-2xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button type="submit" className="px-2 py-1 rounded bg-primary text-primary-foreground text-2xs">Set</button>
            </form>
          ) : (
            <Item onClick={() => setShowCustom(true)} label="Custom date…" />
          )}
        </div>
      )}
    </div>
  )
}

function Item({ onClick, label, hint }: { onClick: () => void; label: string; hint?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-foreground hover:bg-surface-1 transition-colors"
    >
      <span>{label}</span>
      {hint && <span className="text-2xs text-muted-foreground tabular-nums">{hint}</span>}
    </button>
  )
}
