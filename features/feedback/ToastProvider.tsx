'use client'

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CheckCircle2, AlertCircle, Info, X, Undo2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type ToastKind = 'success' | 'error' | 'info'

export type ToastInput = {
  message: string
  kind?: ToastKind
  /** Optional undo affordance — Phase 13 ships the slot; handlers wire real undo later. */
  undo?: () => void | Promise<void>
  durationMs?: number
}

type Toast = Required<Omit<ToastInput, 'undo'>> & { id: number; undo?: () => void | Promise<void> }

interface Ctx {
  toast: (input: ToastInput) => void
  success: (message: string, opts?: Omit<ToastInput, 'message' | 'kind'>) => void
  error: (message: string, opts?: Omit<ToastInput, 'message' | 'kind'>) => void
  info: (message: string, opts?: Omit<ToastInput, 'message' | 'kind'>) => void
}

const ToastContext = createContext<Ctx | null>(null)

const DEFAULT_DURATION = 3200

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const idRef = useRef(0)

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const toast = useCallback((input: ToastInput) => {
    const id = ++idRef.current
    const t: Toast = {
      id,
      message: input.message,
      kind: input.kind ?? 'info',
      durationMs: input.durationMs ?? DEFAULT_DURATION,
      undo: input.undo,
    }
    setToasts(prev => [...prev.slice(-3), t])   // cap visible stack at 4
    if (t.durationMs > 0) {
      setTimeout(() => dismiss(id), t.durationMs)
    }
  }, [dismiss])

  const value = useMemo<Ctx>(() => ({
    toast,
    success: (message, opts) => toast({ ...opts, message, kind: 'success' }),
    error:   (message, opts) => toast({ ...opts, message, kind: 'error' }),
    info:    (message, opts) => toast({ ...opts, message, kind: 'info' }),
  }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[120] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <ToastRow key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const Icon = toast.kind === 'success' ? CheckCircle2 : toast.kind === 'error' ? AlertCircle : Info
  const accent =
    toast.kind === 'success' ? 'text-emerald-400' :
    toast.kind === 'error'   ? 'text-red-400' :
                               'text-blue-400'

  return (
    <div className={cn(
      'pointer-events-auto flex items-center gap-2.5 min-w-[260px] max-w-[380px] px-3 py-2.5 rounded-lg',
      'bg-card border border-border shadow-2xl',
      'animate-in slide-in-from-bottom-2 fade-in-0 duration-150',
    )}>
      <Icon className={cn('w-4 h-4 flex-shrink-0', accent)} />
      <p className="flex-1 text-sm text-foreground">{toast.message}</p>
      {toast.undo && (
        <button
          onClick={async () => { await toast.undo!(); onDismiss() }}
          className="inline-flex items-center gap-1 text-2xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded hover:bg-surface-2 transition-colors"
        >
          <Undo2 className="w-3 h-3" />
          Undo
        </button>
      )}
      <button
        onClick={onDismiss}
        className="p-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors flex-shrink-0"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  )
}

export function useToast(): Ctx {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
