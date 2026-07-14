'use client'

// Read-only search form for the theme-day diagnostic. Updates the URL (?q, ?day)
// so results are server-rendered; the form itself mutates nothing.

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { WEEKDAY_LABELS } from '@/features/prospecting/schedule/types'

const DAYS = [1, 2, 3, 4, 5] // Mon–Fri (the theme days)

export function ThemeDayDiagnosticForm({ initialQuery, initialDay }: { initialQuery: string; initialDay: number }) {
  const router = useRouter()
  const params = useSearchParams()
  const [q, setQ] = useState(initialQuery)
  const [day, setDay] = useState(initialDay)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const sp = new URLSearchParams(params.toString())
    sp.set('q', q.trim())
    sp.set('day', String(day))
    router.push(`/settings/diagnostics/theme-day?${sp.toString()}`)
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      <div className="min-w-[220px] flex-1 space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="q">Contact / record name</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Takeya Oliver"
            className="w-full rounded-lg border border-border bg-surface-1 py-2 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="day">Theme day</label>
        <select id="day" value={day} onChange={(e) => setDay(Number(e.target.value))}
          className="rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-jubo-navy">
          {DAYS.map((d) => <option key={d} value={d}>{WEEKDAY_LABELS[d]}</option>)}
        </select>
      </div>
      <button type="submit" className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        Diagnose
      </button>
    </form>
  )
}
