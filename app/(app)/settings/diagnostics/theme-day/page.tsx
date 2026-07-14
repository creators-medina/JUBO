import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isOrgAdmin } from '@/features/auth/guards'
import { WEEKDAY_LABELS } from '@/features/prospecting/schedule/types'
import { diagnoseThemeDay } from '@/features/prospecting/themeday/diagnose'
import { DIAGNOSIS_LABEL, type DiagnosisCode } from '@/features/prospecting/themeday/diagnoseClassify'
import { ThemeDayDiagnosticForm } from '@/features/prospecting/themeday/ThemeDayDiagnosticForm'

export const dynamic = 'force-dynamic'

// Admin/owner-only, read-only diagnostic for "why isn't <contact> on <day>'s
// Daily Call Log?". Reuses the real buildThemeDayData logic — no data is changed.
export default async function ThemeDayDiagnosticPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; day?: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: membership } = await supabase
    .from('organization_members').select('organization_id, role').eq('user_id', user.id)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!membership) redirect('/onboarding')
  // Admin/owner only — non-admins are bounced to the settings hub.
  if (!isOrgAdmin((membership as { role: string }).role)) redirect('/settings')

  const sp = await searchParams
  const query = (sp.q ?? '').trim()
  const dayNum = Number(sp.day)
  const weekday = [1, 2, 3, 4, 5].includes(dayNum) ? dayNum : 2 // default Tuesday

  const result = await diagnoseThemeDay(query, weekday)

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Daily Call Log diagnostic</h1>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Read-only. Search a contact and pick a theme day to see exactly why they do or don&apos;t appear in that
          day&apos;s Daily Call Log. Uses the same source logic as the live call list. Scoped to this organization; admins only.
        </p>
      </div>

      <ThemeDayDiagnosticForm initialQuery={query} initialDay={weekday} />

      {'error' in result ? (
        <p className="rounded-lg border border-border bg-surface-1 px-4 py-3 text-sm text-muted-foreground">
          You don&apos;t have access to this diagnostic.
        </p>
      ) : (
        <>
          <DayContext result={result} />
          {!query ? (
            <p className="rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
              Type a contact name above (e.g. <span className="font-medium text-foreground">Takeya Oliver</span>) and press
              Diagnose.
            </p>
          ) : result.records.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border bg-card px-6 py-8 text-center text-sm text-muted-foreground">
              {DIAGNOSIS_LABEL.no_match} for &ldquo;{query}&rdquo; in this organization. Try a shorter or partial name.
            </p>
          ) : (
            <div className="space-y-4">
              {result.records.map((r) => <RecordCard key={r.recordId} r={r} weekday={weekday} />)}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function DayContext({ result }: { result: Extract<Awaited<ReturnType<typeof diagnoseThemeDay>>, { weekday: number }> }) {
  const s = result.schedule
  return (
    <section className="space-y-2 rounded-xl border border-border bg-surface-1 p-4 text-xs">
      <p className="text-sm font-semibold text-foreground">{WEEKDAY_LABELS[result.weekday]} source</p>
      <Row label="Effective schedule mode" value={s.effectiveMode} />
      <Row label="Schedule source" value={s.source} />
      <Row label="User schedule row exists" value={String(s.userRowExists)} />
      <Row label="Org-default schedule row exists" value={String(s.orgDefaultExists)} />
      <Row label="Effective source boards" value={result.effectiveSourceBoards.map((b) => b.name).join(', ') || '(none)'} />
      {result.missingBoards.length > 0 && <Row label="Missing playbook boards" value={result.missingBoards.join(', ')} />}
      {result.tuesday && (
        <>
          <Row label="Includes Loan In Process" value={result.tuesday.includesLoanInProcess ? 'yes' : 'no'} />
          <Row label="Includes Inactive Loans" value={result.tuesday.includesInactive ? 'yes' : 'no'} />
        </>
      )}
      <Row label="Day roster total (pre-cap)" value={`${result.rosterTotal}${result.rosterTotal > 500 ? ' · exceeds 500 cap' : ''}`} />
    </section>
  )
}

const POSITIVE: DiagnosisCode[] = ['should_appear']

function RecordCard({ r, weekday }: { r: Extract<Awaited<ReturnType<typeof diagnoseThemeDay>>, { records: unknown[] }>['records'][number]; weekday: number }) {
  const good = POSITIVE.includes(r.diagnosis)
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className={`flex items-center justify-between gap-3 px-4 py-3 ${good ? 'bg-jubo-green-soft/50' : 'bg-jubo-gold-soft/40'}`}>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{r.title}</p>
          <p className="truncate text-2xs text-muted-foreground">{r.boardName}{r.stageGroup ? ` · ${r.stageGroup}` : ''}</p>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-1 text-2xs font-semibold ${good ? 'bg-jubo-green text-white' : 'bg-jubo-gold text-jubo-navy'}`}>
          {DIAGNOSIS_LABEL[r.diagnosis]}
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-2xs sm:grid-cols-3">
        <Check label="In my org" ok={r.passInMyOrg} />
        <Check label="Not archived" ok={r.passNotArchived} />
        <Check label="Status active" ok={r.passStatusActive} />
        <Check label="Top-level (no parent)" ok={r.passTopLevel} />
        <Check label="No do_not_contact" ok={!r.hasDoNotContact} />
        <Check label={`Board matches ${WEEKDAY_LABELS[weekday]} playbook`} ok={r.boardMatchesPlaybook} />
        <Check label="Board in effective source" ok={r.boardInEffectiveSource} />
        <Check label="Qualifies (pre-cap)" ok={r.qualifiesPreCap} />
        {r.estRankByTitle != null && <Field label="Est. rank by title" value={`#${r.estRankByTitle}`} />}
        {r.withinCap != null && <Check label="Within 500 cap" ok={r.withinCap} />}
        <Field label="Record id" value={r.recordId} />
        <Field label="Board id" value={r.boardId ?? '—'} />
        <Field label="Group id" value={r.groupId ?? '—'} />
        <Field label="Owner" value={r.ownerUserId ?? '—'} />
        <Field label="Assigned" value={r.assignedUserId ?? '—'} />
        <Field label="Created by" value={r.createdBy ?? '—'} />
      </dl>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return <p className="flex flex-wrap gap-x-2 text-muted-foreground"><span className="min-w-[180px] font-medium text-foreground">{label}</span><span className="break-all">{value}</span></p>
}
function Field({ label, value }: { label: string; value: string }) {
  return <div><dt className="uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-0.5 break-all font-medium text-foreground">{value}</dd></div>
}
function Check({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div>
      <dt className="uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-semibold ${ok ? 'text-jubo-green' : 'text-jubo-red'}`}>{ok ? 'PASS' : 'FAIL'}</dd>
    </div>
  )
}
