'use client'

// ─────────────────────────────────────────────────────────────────────────
// CommunicationsLog (Command Center · Phase 4) — a "mission log" that surfaces
// the latest transmission per channel so a loan officer knows, at a glance:
// Last Call · Last SMS · Last Email · (Last Meeting) · Last Note · Last Activity
// — without opening the Activity or Notes tabs.
//
// Pure presentation: derives everything from data WorkspacePanel already loads
// (communication_logs, notes, the synthesized timeline). No queries, no engine,
// no comms/notes mutations. Channels with no activity collapse. "Full history"
// routes to the existing Activity experience via the provided callback.
// ─────────────────────────────────────────────────────────────────────────

import {
  Phone, Mail, MessageSquare, Calendar, StickyNote, Activity as ActivityIcon,
  ArrowUpRight, ArrowDownLeft, ChevronRight, Radio,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatRelativeTime } from '@/features/boards/components/KanbanCardFace'
import { OUTCOME_LABEL, type CommunicationLog, type CommunicationOutcome } from '@/features/communications/types'
import type { NoteRow, TimelineItem } from '../types'

// Channel/source colors — the mission log's signature (semantic, not decorative).
const ACCENT = {
  call: 'var(--accent-violet)',
  sms: 'var(--accent-cyan)',
  email: 'var(--accent-blue)',
  meeting: 'var(--accent-green)',
  note: 'var(--accent-amber)',
  activity: 'var(--muted-foreground)',
} as const

/** Outcome → dot color (connected good · pending amber · negative rose). */
function outcomeDot(outcome: CommunicationOutcome | null): string | null {
  if (!outcome) return null
  if (['connected', 'completed', 'interested', 'booked_appointment', 'received'].includes(outcome)) return 'var(--accent-green)'
  if (['no_answer', 'voicemail', 'follow_up_needed', 'needs_docs', 'call_back_later', 'left_message', 'nurture', 'scheduled'].includes(outcome)) return 'var(--accent-amber)'
  if (['not_interested', 'do_not_contact', 'wrong_number', 'cancelled'].includes(outcome)) return 'var(--accent-rose)'
  return 'var(--muted-foreground)'
}

type Entry = {
  key: string
  label: string
  icon: React.ElementType
  accent: string
  when: string
  preview: string
  dot?: string | null
  direction?: 'inbound' | 'outbound' | 'internal'
}

function commPreview(l: CommunicationLog): string {
  return l.summary?.trim() || l.subject?.trim() || (l.outcome ? OUTCOME_LABEL[l.outcome] : 'Logged')
}

function lastOfChannel(logs: CommunicationLog[], channel: CommunicationLog['channel']): CommunicationLog | null {
  let best: CommunicationLog | null = null
  for (const l of logs) {
    if (l.channel !== channel) continue
    if (!best || l.occurred_at > best.occurred_at) best = l
  }
  return best
}

export function CommunicationsLog({
  logs, notes, timeline, onFullHistory,
}: {
  logs: CommunicationLog[]
  notes: NoteRow[]
  timeline: TimelineItem[]
  onFullHistory: () => void
}) {
  const entries: Entry[] = []

  const channelDefs: { channel: CommunicationLog['channel']; label: string; icon: React.ElementType; accent: string }[] = [
    { channel: 'call', label: 'Call', icon: Phone, accent: ACCENT.call },
    { channel: 'sms', label: 'SMS', icon: MessageSquare, accent: ACCENT.sms },
    { channel: 'email', label: 'Email', icon: Mail, accent: ACCENT.email },
    { channel: 'meeting', label: 'Meeting', icon: Calendar, accent: ACCENT.meeting },
  ]
  for (const def of channelDefs) {
    const l = lastOfChannel(logs, def.channel)
    if (!l) continue // collapse channels with no activity
    entries.push({
      key: def.channel, label: def.label, icon: def.icon, accent: def.accent,
      when: l.occurred_at, preview: commPreview(l), dot: outcomeDot(l.outcome), direction: l.direction,
    })
  }

  // Last note (notes arrive newest-first from the loader).
  const lastNote = notes[0]
  if (lastNote) {
    entries.push({
      key: 'note', label: 'Note', icon: StickyNote, accent: ACCENT.note,
      when: lastNote.created_at, preview: (lastNote.content ?? '').replace(/\s+/g, ' ').trim() || 'Note added',
    })
  }

  // Last activity of ANY type (catch-all: stage moves, tasks, field changes…).
  const lastActivity = timeline[0]
  if (lastActivity) {
    entries.push({
      key: 'activity', label: 'Last activity', icon: ActivityIcon, accent: ACCENT.activity,
      when: lastActivity.timestamp,
      preview: (lastActivity.content ?? lastActivity.activity_type.replace(/_/g, ' ')).trim() || 'Activity',
    })
  }

  return (
    <section className="rounded-xl border border-border/60 bg-surface-1/30 p-3.5">
      <div className="mb-2.5 flex items-center gap-1.5">
        <Radio className="h-3.5 w-3.5 text-muted-foreground" />
        <p className="text-2xs font-semibold uppercase tracking-wider text-muted-foreground">Communications</p>
        <button
          type="button"
          onClick={onFullHistory}
          className="ml-auto -my-0.5 inline-flex items-center gap-0.5 rounded py-0.5 text-2xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Full history <ChevronRight className="h-3 w-3" />
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="py-2 text-2xs text-muted-foreground italic">No communications logged yet.</p>
      ) : (
        <div className="space-y-1">
          {entries.map((e) => {
            const Icon = e.icon
            const DirIcon = e.direction === 'inbound' ? ArrowDownLeft : e.direction === 'outbound' ? ArrowUpRight : null
            return (
              <div key={e.key} className="flex items-center gap-2.5 rounded-lg py-1">
                <span
                  aria-hidden
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `color-mix(in oklch, ${e.accent} 16%, transparent)`, color: e.accent }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {DirIcon && <DirIcon className="h-2.5 w-2.5 flex-shrink-0 text-muted-foreground/70" aria-hidden />}
                    <span className="text-xs font-medium text-foreground">{e.label}</span>
                    {e.dot && <span className="h-1.5 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: e.dot }} aria-hidden />}
                    <span className="ml-auto flex-shrink-0 text-2xs tabular-nums text-muted-foreground">{formatRelativeTime(e.when) || '—'}</span>
                  </div>
                  <p className="truncate text-2xs text-muted-foreground">{e.preview}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
