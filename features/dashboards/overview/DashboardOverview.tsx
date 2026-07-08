'use client'

// ─────────────────────────────────────────────────────────────────────────
// Dashboard overview — the /dashboard home screen (Claude Design
// "Dashboard.dc.html" handoff, recreated in the app stack). Fit-to-screen on
// desktop (no page scroll; lists scroll internally): header + period toggle,
// KPI row with prior-period deltas, then three columns — pipeline + activity,
// theme day + closings, monthly goal + follow-ups.
//
// All values are live CRM data from buildDashboardOverview. Count-up
// animations run on a single setInterval tween (t: 0→1, 950ms cubic ease —
// per the prototype, no requestAnimationFrame) and re-run when the period
// changes. Follow-up checkboxes resolve real follow-ups through the existing
// resolveFollowUp action (un-checking in-session is view-only).
// ─────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { useToast } from '@/features/feedback/ToastProvider'
import { resolveFollowUp } from '@/features/communications/actions'
import type { DashboardOverviewData, PeriodKey, PeriodKpis } from './queries'

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'This quarter' },
]

// Design palette (Dashboard.dc.html :root)
const INK = '#20303F', INK2 = '#5A6B79', MUTED = '#8B8474', LINE = '#E7DFD0'
const ACCENT = '#B8492C', GREEN = '#3E7D4F', TRACK = '#EAE1D2'
const STAGE_FALLBACK = ['#5B7C93', '#B9852A', '#B8492C', '#3E7D4F', '#7C6BA8', '#4E8D8A']

const archivo = { fontFamily: 'var(--font-archivo), var(--font-plex), system-ui, sans-serif' }

function fmtMoney(v: number): string {
  v = Math.round(v)
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K'
  return '$' + v
}

/** Single timer tween shared by every count-up on the page. */
function useCountUp(key: string): number {
  const [t, setT] = useState(0)
  const iv = useRef<number | undefined>(undefined)
  useEffect(() => {
    window.clearInterval(iv.current)
    const t0 = Date.now(), dur = 950
    // First tick lands ~16ms in, so the tween restarts from ~0 on its own —
    // no synchronous setState in the effect body.
    iv.current = window.setInterval(() => {
      const k = Math.min(1, (Date.now() - t0) / dur)
      setT(1 - Math.pow(1 - k, 3))
      if (k >= 1) window.clearInterval(iv.current)
    }, 16)
    return () => window.clearInterval(iv.current)
  }, [key])
  return t
}

function relTime(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}

const ACTIVITY_DOT: [RegExp, string][] = [
  [/creat|new|added|lead/i, GREEN],
  [/call|comm|connect/i, GREEN],
  [/move|stage|group/i, ACCENT],
  [/lock|rate|birthday|task/i, '#B9852A'],
]
function activityColor(type: string): string {
  for (const [re, c] of ACTIVITY_DOT) if (re.test(type)) return c
  return '#5B7C93'
}

export function DashboardOverview({ data }: { data: DashboardOverviewData }) {
  const toast = useToast()
  const [period, setPeriod] = useState<PeriodKey>('month')
  const t = useCountUp(period)

  // Follow-up completion — checking resolves the real follow-up (existing
  // action); un-checking in-session only reverts the view.
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set())
  const inFlight = useRef<Set<string>>(new Set())
  const toggleTask = (id: string) => {
    if (doneIds.has(id)) {
      setDoneIds((s) => { const n = new Set(s); n.delete(id); return n })
      return
    }
    if (inFlight.current.has(id)) return
    inFlight.current.add(id)
    setDoneIds((s) => new Set(s).add(id))
    resolveFollowUp(id)
      .then((res) => {
        if (res && 'error' in res) {
          setDoneIds((s) => { const n = new Set(s); n.delete(id); return n })
          toast.error('Could not complete the follow-up — try again.')
        }
      })
      .finally(() => inFlight.current.delete(id))
  }

  const now = new Date()
  const hr = now.getHours()
  const greeting = `${hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening'}, ${data.firstName}`
  const dateLabel = `${now.toLocaleDateString('en-US', { weekday: 'long' })} · ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`.toUpperCase()

  // ── KPI cards for the selected period ──
  const { cur, prev } = data.kpis[period]
  const kpiCards = useMemo(() => buildKpiCards(cur, prev), [cur, prev])

  // ── Pipeline ──
  const maxMoney = Math.max(1, ...data.pipeline.map((s) => s.money))
  const pipeTotal = data.pipeline.reduce((a, s) => a + s.money, 0)
  const pipeCount = data.pipeline.reduce((a, s) => a + s.count, 0)

  // ── Theme ring (r=34, c≈213.6 — per the prototype) ──
  const THC = 213.6
  const themeFrac = data.theme.goal > 0 ? data.theme.done / data.theme.goal : 0
  const themeDash = (THC * (1 - themeFrac * t)).toFixed(1)

  // ── Goal ──
  const goalRows = data.goal ? [
    { label: 'Units funded', cur: data.goal.curUnits, tgt: data.goal.units, money: false, amber: false },
    { label: 'Volume', cur: data.goal.curVolume, tgt: data.goal.volume, money: true, amber: true },
  ].filter((g) => g.tgt != null && g.tgt > 0) : []
  const goalPct = goalRows.length > 0 ? Math.round((goalRows[0].cur / (goalRows[0].tgt as number)) * 100) : null

  const doneCount = data.followUps.filter((f) => doneIds.has(f.id)).length

  return (
    <div
      className="mx-auto flex h-full w-full max-w-[1320px] flex-col gap-3 overflow-y-auto px-5 py-4 lg:gap-[13px] lg:overflow-hidden"
      style={{ color: INK, fontFamily: 'var(--font-plex), system-ui, sans-serif' }}
    >
      {/* ── Header ── */}
      <div className="flex flex-none flex-wrap items-end justify-between gap-4">
        <div>
          {/* suppressHydrationWarning: server (UTC) and browser local time can
              disagree on the date/hour; the client value wins. */}
          <div suppressHydrationWarning className="text-[11px] font-bold uppercase tracking-[0.13em]" style={{ color: MUTED }}>{dateLabel}</div>
          <h1 suppressHydrationWarning className="mt-0.5 text-[26px] font-extrabold tracking-[-0.01em]" style={archivo}>{greeting}</h1>
          <div className="mt-0.5 text-[13.5px]" style={{ color: INK2 }}>Here&apos;s what&apos;s happening across your business.</div>
        </div>
        <div className="flex gap-[3px] rounded-[11px] p-[3px]" style={{ background: TRACK }}>
          {PERIODS.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn('rounded-lg px-3.5 py-[7px] text-[12.5px] font-semibold transition-all',
                period === p.key ? 'bg-white shadow-sm' : 'hover:brightness-95')}
              style={{ color: period === p.key ? INK : INK2 }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid flex-none grid-cols-2 gap-3 lg:grid-cols-4">
        {kpiCards.map((k) => (
          <div key={k.label} className="rounded-[14px] border bg-white px-3.5 py-3" style={{ borderColor: LINE }}>
            <div className="text-[11px] font-bold uppercase tracking-[0.07em]" style={{ color: MUTED }}>{k.label}</div>
            <div className="mt-1.5 text-[25px] font-extrabold leading-none tabular-nums" style={archivo}>
              {k.value == null ? '—' : k.money ? fmtMoney(k.value * t) : String(Math.round(k.value * t))}
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-bold tabular-nums"
              style={{ color: k.delta == null ? MUTED : k.up ? GREEN : ACCENT }}>
              {k.delta == null ? <span>—</span> : (<><span className="text-[9px]">{k.up ? '▲' : '▼'}</span>{k.delta}</>)}
            </div>
          </div>
        ))}
      </div>

      {/* ── Three-column body ── */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1.42fr_1fr_1fr] lg:gap-[13px]">
        {/* Column 1 — pipeline + activity */}
        <div className="flex min-h-0 flex-col gap-3 lg:gap-[13px]">
          <Card>
            <CardHead title="Active pipeline" meta="by stage" />
            {data.pipeline.length === 0 ? (
              <EmptyNote>No pipeline boards yet.</EmptyNote>
            ) : (
              <div className="mt-3 flex flex-col gap-[11px]">
                {data.pipeline.map((s, i) => {
                  const color = s.color || STAGE_FALLBACK[i % STAGE_FALLBACK.length]
                  return (
                    <div key={s.boardId} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-[13px] font-semibold">
                          <span className="h-[9px] w-[9px] flex-none rounded-[3px]" style={{ background: color }} />
                          {s.name}
                        </div>
                        <div className="text-xs tabular-nums" style={{ color: INK2 }}>
                          <b className="font-bold" style={{ ...archivo, color: INK }}>{s.count}</b> · {fmtMoney(s.money)}
                        </div>
                      </div>
                      <div className="h-[9px] overflow-hidden rounded-full" style={{ background: TRACK }}>
                        <div className="h-full rounded-full" style={{ width: `${((s.money / maxMoney) * 100 * t).toFixed(1)}%`, background: color }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <div className="mt-3 flex items-center justify-between border-t pt-3" style={{ borderColor: LINE }}>
              <div className="text-xs font-semibold uppercase tracking-[0.06em]" style={{ color: MUTED }}>Total in pipeline</div>
              <div className="text-[19px] font-extrabold tabular-nums" style={archivo}>{fmtMoney(pipeTotal)} · {pipeCount} loans</div>
            </div>
          </Card>

          <Card fill>
            <CardHead title="Recent activity" meta="across all boards" />
            <Scrolly>
              {data.activity.length === 0 ? (
                <EmptyNote>No activity yet — it shows up here as you work.</EmptyNote>
              ) : data.activity.map((a) => (
                <div key={a.id} className="flex items-start gap-2.5 border-b py-[9px] last:border-b-0" style={{ borderColor: LINE }}>
                  <span className="mt-1.5 h-2 w-2 flex-none rounded-full" style={{ background: activityColor(a.type) }} />
                  <div className="min-w-0">
                    <div className="text-[13px] leading-[1.35]">{a.text}</div>
                    <div className="mt-0.5 text-[11px] tabular-nums" style={{ color: MUTED }}>{relTime(a.at)}</div>
                  </div>
                </div>
              ))}
            </Scrolly>
          </Card>
        </div>

        {/* Column 2 — theme day + closings */}
        <div className="flex min-h-0 flex-col gap-3 lg:gap-[13px]">
          <div className="flex-none rounded-2xl bg-jubo-navy p-4 text-white">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#8FB99C]">Today · Theme day</div>
              <span className="rounded-full px-2.5 py-[3px] text-[10px] font-bold uppercase tracking-[0.05em]" style={{ background: ACCENT }}>{data.theme.shortName}</span>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative grid flex-none place-items-center">
                <svg className="block -rotate-90" viewBox="0 0 84 84" width="80" height="80">
                  <circle cx="42" cy="42" r="34" fill="none" stroke="rgba(255,255,255,.15)" strokeWidth="8" />
                  <circle cx="42" cy="42" r="34" fill="none" stroke="#7CDBA0" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={String(THC)} strokeDashoffset={themeDash}
                    style={{ filter: 'drop-shadow(0 0 4px rgba(120,220,150,.6))' }} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <div className="text-[22px] font-extrabold" style={archivo}>{data.theme.done}</div>
                  <div className="mt-0.5 text-[10px] text-[#8CA0AF]">of {data.theme.goal}</div>
                </div>
              </div>
              <div className="min-w-0">
                <div className="truncate text-xl font-extrabold" style={archivo}>{data.theme.name}</div>
                <div className="mt-0.5 truncate text-xs text-[#AEBECB]">
                  {data.theme.sources.length > 0 ? data.theme.sources.join(' · ') : 'No source boards found'}
                </div>
                <Link href="/prospecting"
                  className="mt-2.5 inline-flex items-center gap-1.5 rounded-[10px] bg-white px-3.5 py-2 text-[13px] font-semibold transition-transform hover:-translate-y-px"
                  style={{ color: INK }}>
                  Open prospecting →
                </Link>
              </div>
            </div>
          </div>

          <Card fill>
            <CardHead title="Upcoming closings" meta="next 30 days" />
            <Scrolly>
              {data.closings.length === 0 ? (
                <EmptyNote>No closings with a close date in the next 30 days.</EmptyNote>
              ) : data.closings.map((c, i) => (
                <div key={c.recordId} className="flex items-center justify-between gap-2.5 border-b py-2.5 last:border-b-0" style={{ borderColor: LINE }}>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-semibold">{c.name}</div>
                    <div className="mt-0.5 truncate text-[11.5px] tabular-nums" style={{ color: MUTED }}>{c.boardName}</div>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-1 text-right">
                    <div className="text-sm font-bold tabular-nums" style={archivo}>{c.amount != null ? fmtMoney(c.amount) : '—'}</div>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10.5px] font-bold')}
                      style={i === 0 ? { background: ACCENT, color: '#fff' } : { background: '#EEE7DA', color: INK2 }}>
                      {new Date(c.closeDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </Scrolly>
          </Card>
        </div>

        {/* Column 3 — monthly goal + follow-ups */}
        <div className="flex min-h-0 flex-col gap-3 lg:gap-[13px]">
          <Card>
            <CardHead title="Monthly goal" meta={goalPct != null ? `${goalPct}% there` : 'no goal set'} />
            {goalRows.length === 0 ? (
              <EmptyNote>Set a production goal to track pace here.</EmptyNote>
            ) : (
              <div className="mt-3 flex flex-col gap-3.5">
                {goalRows.map((g) => (
                  <div key={g.label} className="flex flex-col gap-[7px]">
                    <div className="flex items-baseline justify-between">
                      <div className="text-[13px] font-semibold">{g.label}</div>
                      <div className="text-xs tabular-nums" style={{ color: INK2 }}>
                        <b className="text-sm font-extrabold" style={{ ...archivo, color: INK }}>
                          {g.money ? fmtMoney(g.cur * t) : Math.round(g.cur * t)}
                        </b>{' '}/ {g.money ? fmtMoney(g.tgt as number) : g.tgt}
                      </div>
                    </div>
                    <div className="h-[9px] overflow-hidden rounded-full" style={{ background: TRACK }}>
                      <div className="h-full rounded-full"
                        style={{ width: `${Math.min(100, (g.cur / (g.tgt as number)) * 100 * t).toFixed(1)}%`, background: g.amber ? '#B9852A' : GREEN }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card fill>
            <CardHead title="Follow-ups due" meta={`${doneCount}/${data.followUps.length} done`} />
            <Scrolly>
              {data.followUps.length === 0 ? (
                <EmptyNote>Nothing due — you&apos;re caught up.</EmptyNote>
              ) : data.followUps.map((f) => {
                const on = doneIds.has(f.id)
                return (
                  <button key={f.id} onClick={() => toggleTask(f.id)}
                    className="flex w-full items-center gap-[11px] border-b py-2.5 text-left last:border-b-0" style={{ borderColor: LINE }}>
                    <span className="grid h-5 w-5 flex-none place-items-center rounded-md border-[1.8px] transition-all"
                      style={on ? { background: GREEN, borderColor: GREEN } : { borderColor: '#C9BFAB' }}>
                      <svg viewBox="0 0 24 24" fill="none" className={cn('h-3 w-3 text-white transition-opacity', on ? 'opacity-100' : 'opacity-0')}>
                        <path d="M5 12.5l4 4 10-10" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                    <span className={cn('min-w-0 truncate text-[13px]', on && 'line-through')} style={{ color: on ? MUTED : INK }}>
                      {followUpLabel(f)}
                    </span>
                  </button>
                )
              })}
            </Scrolly>
          </Card>
        </div>
      </div>
    </div>
  )
}

function followUpLabel(f: DashboardOverviewData['followUps'][number]): string {
  return `Follow up — ${f.recordTitle ?? 'Untitled record'}`
}

type KpiCard = { label: string; value: number | null; money: boolean; delta: string | null; up: boolean }
function buildKpiCards(cur: PeriodKpis, prev: PeriodKpis): KpiCard[] {
  const pctDelta = (c: number, p: number): [string, boolean] | null =>
    p > 0 ? [`${Math.abs(Math.round(((c - p) / p) * 100))}%`, c >= p] : null
  const absDelta = (c: number, p: number): [string, boolean] | null =>
    p > 0 || c > 0 ? [String(Math.abs(c - p)), c >= p] : null
  const mk = (label: string, value: number | null, money: boolean, d: [string, boolean] | null): KpiCard =>
    ({ label, value, money, delta: d?.[0] ?? null, up: d?.[1] ?? true })
  return [
    mk('Funded volume', cur.funded, true, pctDelta(cur.funded, prev.funded)),
    mk('Units funded', cur.units, false, absDelta(cur.units, prev.units)),
    mk('Commission', cur.commission, true, cur.commission != null && prev.commission != null ? pctDelta(cur.commission, prev.commission) : null),
    mk('New leads', cur.leads, false, absDelta(cur.leads, prev.leads)),
  ]
}

function Card({ children, fill }: { children: React.ReactNode; fill?: boolean }) {
  return (
    <div className={cn('rounded-2xl border bg-white px-4 py-[15px]', fill && 'flex min-h-0 flex-1 flex-col')}
      style={{ borderColor: LINE }}>
      {children}
    </div>
  )
}

function CardHead({ title, meta }: { title: string; meta: string }) {
  return (
    <div className="flex flex-none items-center justify-between gap-2.5">
      <div className="text-[14.5px] font-bold" style={archivo}>{title}</div>
      <div className="text-xs font-semibold tabular-nums" style={{ color: MUTED }}>{meta}</div>
    </div>
  )
}

function Scrolly({ children }: { children: React.ReactNode }) {
  return <div className="mt-1 min-h-0 flex-1 overflow-y-auto">{children}</div>
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-xs" style={{ color: MUTED }}>{children}</p>
}
