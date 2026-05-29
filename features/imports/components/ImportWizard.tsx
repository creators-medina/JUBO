'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  UploadCloud, FileSpreadsheet, ArrowRight, ArrowLeft, Check, Loader2,
  Columns3, Sparkles, AlertTriangle, ListChecks, Workflow, Sunrise,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { parseFile } from '../parsers'
import { autoMapColumns } from '../mapping/autoMap'
import { importTemplateByKey } from '../templates/importTemplates'
import {
  analyzeDuplicates, createImportRun, executeImportChunk, finalizeImport, getBoardFieldsAndGroups,
} from '../actions'
import { createImportField } from '@/features/fields/actions'
import { MappingTable } from './MappingTable'
import { PreviewTable } from './PreviewTable'
import {
  TITLE_TARGET, type ParsedFile, type ColumnMapping, type TargetField,
  type AnalyzeResult, type DedupeKey, type DedupeBehavior, type ExecutionRow, type ImportSummary,
} from '../types'
import type { FieldType, RecordType } from '@/types/database'

type Step = 'upload' | 'board' | 'map' | 'preview' | 'run' | 'done'
const STEPS: { key: Step; label: string }[] = [
  { key: 'upload', label: 'Upload' },
  { key: 'board', label: 'Target' },
  { key: 'map', label: 'Map' },
  { key: 'preview', label: 'Review' },
  { key: 'done', label: 'Done' },
]
const CHUNK_SIZE = 100

export function ImportWizard({
  organizationId,
  boards,
  templateKey,
}: {
  organizationId: string
  boards: { id: string; name: string; slug: string }[]
  templateKey?: string
}) {
  const router = useRouter()
  const template = templateKey ? importTemplateByKey(templateKey) : undefined

  const [step, setStep] = useState<Step>('upload')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [sheetIndex, setSheetIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [boardId, setBoardId] = useState<string>('')
  const [groupId, setGroupId] = useState<string>('')
  const [fields, setFields] = useState<TargetField[]>([])
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([])

  const [mappings, setMappings] = useState<ColumnMapping[]>([])
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null)
  const [dedupeBehavior, setDedupeBehavior] = useState<DedupeBehavior>('skip')
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const [summary, setSummary] = useState<ImportSummary | null>(null)

  const dedupeKeys: DedupeKey[] = template?.dedupeKeys ?? ['email', 'phone']
  const recordType: RecordType = template?.recordType ?? 'lead'

  const sheet = parsed?.sheets[sheetIndex]
  const headers = sheet?.headers ?? []
  const rows = sheet?.rows ?? []

  // Preselect the template's target board if present.
  useEffect(() => {
    if (template?.targetBoardSlug && !boardId) {
      const match = boards.find((b) => b.slug === template.targetBoardSlug)
      if (match) setBoardId(match.id)
    }
  }, [template, boards, boardId])

  // Load fields/groups when the board changes.
  useEffect(() => {
    if (!boardId) return
    let cancelled = false
    getBoardFieldsAndGroups(boardId).then(({ fields, groups }) => {
      if (cancelled) return
      setFields(fields)
      setGroups(groups)
      setGroupId((g) => g || groups[0]?.id || '')
    })
    return () => { cancelled = true }
  }, [boardId])

  // ── File upload ─────────────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    setError(null); setBusy(true)
    try {
      const result = await parseFile(file)
      setParsed(result); setSheetIndex(0)
      setStep('board')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.')
    } finally {
      setBusy(false)
    }
  }, [])

  // ── Build mappings when entering the map step ─────────────────────────────
  const enterMap = useCallback(() => {
    let m = autoMapColumns(headers, rows, fields)
    // Guarantee a title column — fall back to the first column.
    if (!m.some((x) => x.target === TITLE_TARGET) && m.length > 0) {
      m = m.map((x, i) => (i === 0 ? { ...x, target: TITLE_TARGET } : x))
    }
    setMappings(m)
    setStep('map')
  }, [headers, rows, fields])

  const setMapping = (columnIndex: number, target: string) => {
    setMappings((prev) => prev.map((m) => {
      if (m.columnIndex === columnIndex) return { ...m, target, meta: { confidence: 1, reason: 'manual' } }
      // enforce single title
      if (target === TITLE_TARGET && m.target === TITLE_TARGET) return { ...m, target: '' }
      return m
    }))
  }

  // Create a field on the selected board from a column, add it to the live field
  // list, and let the caller map to it immediately.
  const handleCreateField = useCallback(async (_columnIndex: number, name: string, ftype: FieldType): Promise<TargetField | null> => {
    try {
      const f = await createImportField({ boardId, name, fieldType: ftype })
      setFields((prev) => [...prev, f])
      return f
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create field')
      return null
    }
  }, [boardId])

  const titleColIndex = useMemo(
    () => mappings.find((m) => m.target === TITLE_TARGET)?.columnIndex ?? -1,
    [mappings],
  )
  const fieldType = useMemo(() => new Map(fields.map((f) => [f.id, f.field_type])), [fields])

  // ── Dedupe analysis ───────────────────────────────────────────────────────
  const enterPreview = useCallback(async () => {
    setBusy(true); setError(null)
    try {
      const emailCol = mappings.find((m) => fieldType.get(m.target) === 'email')?.columnIndex
      const phoneCol = mappings.find((m) => fieldType.get(m.target) === 'phone')?.columnIndex
      const candidates = rows.map((r, i) => ({
        rowIndex: i,
        name: titleColIndex >= 0 ? r[titleColIndex] : undefined,
        email: emailCol != null ? r[emailCol] : undefined,
        phone: phoneCol != null ? r[phoneCol] : undefined,
      }))
      const result = await analyzeDuplicates(boardId, dedupeKeys, candidates)
      setAnalysis(result)
      setStep('preview')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze duplicates.')
    } finally {
      setBusy(false)
    }
  }, [mappings, fieldType, rows, titleColIndex, boardId, dedupeKeys])

  const matchByRow = useMemo(() => {
    const map = new Map<number, AnalyzeResult['matches'][number]>()
    for (const m of analysis?.matches ?? []) map.set(m.rowIndex, m)
    return map
  }, [analysis])

  // ── Execution ──────────────────────────────────────────────────────────────
  const runImport = useCallback(async () => {
    setStep('run'); setError(null)
    const duplicates = analysis?.duplicates ?? 0

    // Process all rows except duplicates we're skipping. On 'update', duplicates
    // become in-place updates; on 'create', they create new records.
    const processIndexes = rows
      .map((_, i) => i)
      .filter((i) => !(dedupeBehavior === 'skip' && matchByRow.get(i)?.isDuplicate))

    const fieldTypes: Record<string, FieldType> = {}
    for (const m of mappings) {
      if (m.target && m.target !== TITLE_TARGET) {
        const ft = fieldType.get(m.target)
        if (ft) fieldTypes[m.target] = ft
      }
    }

    const execRows: ExecutionRow[] = processIndexes.map((i) => {
      const r = rows[i]
      const values: Record<string, string> = {}
      const source: Record<string, string> = {}
      for (const m of mappings) {
        const cell = r[m.columnIndex] ?? ''
        source[m.header] = cell
        if (m.target && m.target !== TITLE_TARGET) values[m.target] = cell
      }
      const match = matchByRow.get(i)
      const matchedRecordId = dedupeBehavior === 'update' && match?.isDuplicate ? match.matchedRecordId : undefined
      return { rowIndex: i, title: titleColIndex >= 0 ? (r[titleColIndex] ?? '') : '', values, source, matchedRecordId }
    })

    setProgress({ done: 0, total: execRows.length })

    let importId = ''
    let imported = 0
    let updated = 0
    let failed = 0
    try {
      importId = await createImportRun({
        organizationId, boardId, groupId: groupId || null,
        sourceType: parsed!.sourceType, templateKey: templateKey ?? null,
        fileName: parsed!.fileName, rowCount: rows.length,
        mapping: { columns: mappings.map((m) => ({ header: m.header, target: m.target })), dedupeBehavior },
      })

      for (let i = 0; i < execRows.length; i += CHUNK_SIZE) {
        const chunk = execRows.slice(i, i + CHUNK_SIZE)
        const res = await executeImportChunk({
          importId, organizationId, boardId, groupId: groupId || null,
          recordType, fieldTypes, rows: chunk,
        })
        imported += res.imported
        updated += res.updated
        failed += res.failed
        setProgress({ done: Math.min(i + chunk.length, execRows.length), total: execRows.length })
      }

      const skipped = dedupeBehavior === 'skip' ? duplicates : 0
      await finalizeImport(importId, organizationId, { imported, updated, skipped, failed, duplicates })
      setSummary({ imported, updated, skipped, failed, duplicates })
      setStep('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.')
      setStep('preview')
    }
  }, [analysis, rows, dedupeBehavior, matchByRow, mappings, fieldType, titleColIndex, organizationId, boardId, groupId, parsed, templateKey, recordType])

  // ── Render ──────────────────────────────────────────────────────────────
  const stepIdx = STEPS.findIndex((s) => s.key === (step === 'run' ? 'preview' : step))

  return (
    <div className="mx-auto flex h-full w-full max-w-3xl flex-col px-6 py-8">
      {/* Stepper */}
      <div className="mb-8 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center gap-2">
            <div className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-2xs font-semibold',
              i < stepIdx ? 'border-primary bg-primary text-primary-foreground'
                : i === stepIdx ? 'border-primary text-primary'
                : 'border-border text-muted-foreground',
            )}>
              {i < stepIdx ? <Check className="h-3 w-3" /> : i + 1}
            </div>
            <span className={cn('text-xs', i === stepIdx ? 'font-medium text-foreground' : 'text-muted-foreground')}>{s.label}</span>
            {i < STEPS.length - 1 && <div className="mx-1 h-px w-6 bg-border" />}
          </div>
        ))}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" /> {error}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        {step === 'upload' && <UploadStep busy={busy} template={template?.label} onFile={handleFile} />}

        {step === 'board' && (
          <BoardStep
            boards={boards} boardId={boardId} setBoardId={setBoardId}
            groups={groups} groupId={groupId} setGroupId={setGroupId}
            parsed={parsed!} sheetIndex={sheetIndex} setSheetIndex={setSheetIndex}
            templateBoardSlug={template?.targetBoardSlug ?? null}
          />
        )}

        {step === 'map' && (
          <div className="space-y-4">
            <Intro title="Tell Jubo where this data belongs" subtitle={`We matched what we could. Confirm each column, create a field for anything missing, or skip it. ★ Record name is required.`} />
            <MappingTable mappings={mappings} fields={fields} sampleRow={rows[0] ?? []} onChange={setMapping} onCreateField={handleCreateField} />
          </div>
        )}

        {step === 'preview' && analysis && (
          <div className="space-y-4">
            <Intro title="Review what Jubo will do" subtitle="Confirm before importing. Duplicates are matched against existing records by email, phone, or name." />
            <div className="flex flex-wrap gap-3">
              <Stat label="Rows" value={rows.length} />
              <Stat label="New" value={rows.length - analysis.duplicates} tone="green" />
              <Stat label="Duplicates" value={analysis.duplicates} tone="amber" />
            </div>
            {analysis.duplicates > 0 && (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-4 py-2.5">
                <span className="text-sm text-foreground">Duplicates:</span>
                <div className="flex gap-1">
                  {(['skip', 'update', 'create'] as DedupeBehavior[]).map((b) => (
                    <button key={b} onClick={() => setDedupeBehavior(b)}
                      className={cn('rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                        dedupeBehavior === b ? 'bg-primary text-primary-foreground' : 'bg-surface-2 text-muted-foreground hover:text-foreground')}>
                      {b === 'skip' ? 'Skip them' : b === 'update' ? 'Update existing' : 'Import anyway'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <PreviewTable mappings={mappings} rows={rows} matchByRow={matchByRow} />
          </div>
        )}

        {step === 'run' && <RunStep progress={progress} />}

        {step === 'done' && summary && (
          <DoneStep summary={summary} boardId={boardId} router={router} />
        )}
      </div>

      {/* Footer nav */}
      {step !== 'run' && step !== 'done' && (
        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <Button variant="ghost" className="gap-1.5" onClick={() => {
            setError(null)
            if (step === 'board') setStep('upload')
            else if (step === 'map') setStep('board')
            else if (step === 'preview') setStep('map')
          }} disabled={step === 'upload'}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step === 'board' && (
            <Button className="gap-1.5" disabled={!boardId} onClick={enterMap}>Map columns <ArrowRight className="h-4 w-4" /></Button>
          )}
          {step === 'map' && (
            <Button className="gap-1.5" disabled={busy || titleColIndex < 0} onClick={enterPreview}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />} Review
            </Button>
          )}
          {step === 'preview' && (
            <Button className="gap-1.5" onClick={runImport}>
              {(() => {
                const dupes = analysis?.duplicates ?? 0
                const newCount = rows.length - dupes
                if (dedupeBehavior === 'update' && dupes > 0) return `Import ${newCount} & update ${dupes}`
                if (dedupeBehavior === 'skip') return `Import ${newCount} record${newCount === 1 ? '' : 's'}`
                return `Import ${rows.length} record${rows.length === 1 ? '' : 's'}`
              })()}
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────
function Intro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'green' | 'amber' }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-2">
      <p className={cn('text-xl font-semibold',
        tone === 'green' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : 'text-foreground')}>{value}</p>
      <p className="text-2xs text-muted-foreground">{label}</p>
    </div>
  )
}

function UploadStep({ busy, template, onFile }: { busy: boolean; template?: string; onFile: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <Intro title={template ? `Import ${template}` : 'Import your data'} subtitle="Drop a CSV or XLSX file. Jubo detects headers, types, and duplicates for you." />
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files?.[0]; if (f) onFile(f) }}
        onClick={() => ref.current?.click()}
        className={cn('mt-6 flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 transition-colors',
          drag ? 'border-primary bg-primary/5' : 'border-border bg-surface-1 hover:bg-surface-2')}
      >
        {busy ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <UploadCloud className="h-8 w-8 text-muted-foreground" />}
        <p className="mt-3 text-sm font-medium text-foreground">{busy ? 'Reading file…' : 'Drop file or click to browse'}</p>
        <p className="mt-1 text-2xs text-muted-foreground">CSV, XLSX · up to 15 MB · 5,000 rows</p>
        <input ref={ref} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
      </div>
    </div>
  )
}

function BoardStep({
  boards, boardId, setBoardId, groups, groupId, setGroupId, parsed, sheetIndex, setSheetIndex, templateBoardSlug,
}: {
  boards: { id: string; name: string; slug: string }[]
  boardId: string; setBoardId: (v: string) => void
  groups: { id: string; name: string }[]; groupId: string; setGroupId: (v: string) => void
  parsed: ParsedFile; sheetIndex: number; setSheetIndex: (i: number) => void
  templateBoardSlug: string | null
}) {
  return (
    <div className="space-y-5">
      <Intro title="Where should this go?" subtitle={`${parsed.fileName} · ${parsed.sheets[sheetIndex]?.rows.length ?? 0} rows${parsed.isMonday ? ' · Monday export detected' : ''}`} />

      {parsed.sheets.length > 1 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">Sheet</p>
          <select value={sheetIndex} onChange={(e) => setSheetIndex(Number(e.target.value))}
            className="w-full rounded-md border border-border bg-surface-1 px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            {parsed.sheets.map((s, i) => <option key={i} value={i}>{s.name} ({s.rows.length} rows)</option>)}
          </select>
        </div>
      )}

      <div>
        <p className="mb-1.5 text-xs font-medium text-foreground">Target board</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {boards.map((b) => (
            <button key={b.id} onClick={() => setBoardId(b.id)}
              className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors',
                boardId === b.id ? 'border-primary/60 bg-primary/10' : 'border-border bg-surface-1 hover:bg-surface-2')}>
              <Columns3 className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
              <span className="truncate text-sm text-foreground">{b.name}</span>
              {b.slug === templateBoardSlug && <Sparkles className="ml-auto h-3.5 w-3.5 flex-shrink-0 text-primary" />}
            </button>
          ))}
        </div>
        {boards.length === 0 && <p className="text-xs text-muted-foreground">No boards yet — finish onboarding to generate starter boards.</p>}
      </div>

      {boardId && groups.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium text-foreground">Add to group</p>
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}
            className="w-full rounded-md border border-border bg-surface-1 px-2 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
      )}
    </div>
  )
}

function RunStep({ progress }: { progress: { done: number; total: number } }) {
  const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="mt-4 text-sm font-medium text-foreground">Importing your records…</p>
      <p className="mt-1 text-2xs text-muted-foreground">{progress.done} of {progress.total}</p>
      <div className="mt-4 h-1.5 w-64 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function DoneStep({ summary, boardId, router }: { summary: ImportSummary; boardId: string; router: ReturnType<typeof useRouter> }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/15 text-primary"><Check className="h-7 w-7" /></div>
      <h2 className="mt-5 text-2xl font-semibold text-foreground">Import complete</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your business is now in Jubo.</p>

      <div className="mt-6 grid grid-cols-3 gap-3 sm:grid-cols-5">
        <Stat label="imported" value={summary.imported} tone="green" />
        <Stat label="updated" value={summary.updated} tone="green" />
        <Stat label="duplicates" value={summary.duplicates} tone="amber" />
        <Stat label="skipped" value={summary.skipped} />
        <Stat label="failed" value={summary.failed} />
      </div>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button className="gap-1.5" onClick={() => router.push(`/boards/${boardId}`)}>
          <Columns3 className="h-4 w-4" /> View board
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => router.push('/today')}>
          <Sunrise className="h-4 w-4" /> Today
        </Button>
        <Button variant="outline" className="gap-1.5" onClick={() => router.push('/settings/workflows')}>
          <Workflow className="h-4 w-4" /> Workflows
        </Button>
        <Button variant="ghost" className="gap-1.5" onClick={() => router.push('/imports')}>
          <ListChecks className="h-4 w-4" /> Import history
        </Button>
      </div>
    </div>
  )
}
