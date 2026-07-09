'use client'

// ─────────────────────────────────────────────────────────────────────────
// Quick Contact bar — the first thing an LO sees on a contact/file card:
// the primary phone plus Call / Text / Email / Log Call, with zero
// scrolling. UI-surface only — every action is the EXISTING behavior:
//   • Call  = tel: link (the LO's own dialer; same as the header icon —
//     nothing is logged automatically)
//   • Text  = jumps to the existing SMS composer (the real send flow is
//     untouched)
//   • Email = mailto: link
//   • Log Call = the existing quickCallOutcome → communication_logs write
//     path with the same six outcomes used everywhere (user-triggered)
// Missing phone/email render honest disabled/empty states. Nothing here
// creates leads, moves records, or touches board/lead-source data.
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react'
import { Phone, MessageSquare, Mail, ClipboardList, ChevronDown, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { quickCallOutcome } from '@/features/communications/actions'
import { OUTCOME_LABEL, type CommunicationOutcome } from '@/features/communications/types'

// Same outcome set as the Daily Call Log / cockpit (product decision).
const LOG_OUTCOMES: CommunicationOutcome[] = [
  'connected', 'interested', 'booked_appointment', 'no_answer', 'voicemail', 'follow_up_needed',
]

const btnBase = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors'

export function QuickContact({ phone, email, recordId, onText, onLogged }: {
  phone: string | null
  email: string | null
  recordId: string
  /** Scrolls/focuses the existing SMS composer (send flow unchanged). */
  onText: () => void
  /** Reload the card after a call is logged so the feed reflects it. */
  onLogged: () => void
}) {
  const toast = useToast()
  const [menuOpen, setMenuOpen] = useState(false)
  const [logging, setLogging] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close the outcome menu on outside click / Escape.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [menuOpen])

  const logCall = async (outcome: CommunicationOutcome) => {
    setMenuOpen(false)
    setLogging(true)
    try {
      // The one existing call-log write path (same as the Daily Call Log).
      await quickCallOutcome(recordId, outcome)
      toast.success(`Call logged — ${OUTCOME_LABEL[outcome] ?? outcome}`)
      onLogged()
    } catch (e) {
      toast.error(`Couldn't log the call — ${e instanceof Error ? e.message : 'please try again'}`)
    } finally {
      setLogging(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-jubo-border-strong/60 bg-jubo-card-soft px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-jubo-muted">Quick Contact</span>
      {phone ? (
        <span className="text-sm font-semibold tabular-nums text-jubo-text">{phone}</span>
      ) : (
        <span className="text-xs italic text-jubo-muted">No phone on file</span>
      )}

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {phone ? (
          <a href={`tel:${phone}`} className={cn(btnBase, 'bg-jubo-red text-white shadow-sm hover:bg-jubo-red-dark')}>
            <Phone className="h-3.5 w-3.5" aria-hidden /> Call
          </a>
        ) : (
          <span className={cn(btnBase, 'cursor-not-allowed border border-jubo-border text-jubo-muted/60')} title="Add a phone number to call">
            <Phone className="h-3.5 w-3.5" aria-hidden /> Call
          </span>
        )}

        {phone ? (
          <button onClick={onText} className={cn(btnBase, 'border border-jubo-border bg-jubo-card text-jubo-text hover:bg-white/60')}>
            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Text
          </button>
        ) : (
          <span className={cn(btnBase, 'cursor-not-allowed border border-jubo-border text-jubo-muted/60')} title="Add a phone number to text">
            <MessageSquare className="h-3.5 w-3.5" aria-hidden /> Text
          </span>
        )}

        {email && (
          <a href={`mailto:${email}`} className={cn(btnBase, 'border border-jubo-border bg-jubo-card text-jubo-text hover:bg-white/60')}>
            <Mail className="h-3.5 w-3.5" aria-hidden /> Email
          </a>
        )}

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen((o) => !o)}
            disabled={logging}
            className={cn(btnBase, 'border border-jubo-border bg-jubo-card text-jubo-text hover:bg-white/60 disabled:opacity-60')}>
            {logging ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <ClipboardList className="h-3.5 w-3.5" aria-hidden />}
            Log Call
            <ChevronDown className="h-3 w-3" aria-hidden />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-40 rounded-lg border border-border bg-card py-1 shadow-lg">
              {LOG_OUTCOMES.map((o) => (
                <button key={o} onClick={() => void logCall(o)}
                  className="block w-full px-3 py-1.5 text-left text-xs text-foreground hover:bg-surface-1">
                  {OUTCOME_LABEL[o] ?? o}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
