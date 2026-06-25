'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle, Clock, Columns3, FileJson } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { IMPORT_TEMPLATES } from '../templates/importTemplates'
import type { ImportRow } from '../types'

const STATUS_STYLE: Record<string, { icon: React.ElementType; cls: string }> = {
  completed: { icon: CheckCircle2, cls: 'text-jubo-green' },
  partial:   { icon: AlertTriangle, cls: 'text-jubo-gold' },
  failed:    { icon: XCircle, cls: 'text-jubo-red' },
  running:   { icon: Clock, cls: 'text-jubo-navy' },
  pending:   { icon: Clock, cls: 'text-muted-foreground' },
}

export function ImportHistoryClient({ imports }: { imports: ImportRow[] }) {
  const router = useRouter()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-border px-6 py-5">
        <div>
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-jubo-navy" />
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Imports</h1>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Bring your business into Jubo from CSV, XLSX, or a Monday export.</p>
        </div>
        <Button className="gap-1.5" onClick={() => router.push('/imports/new')}>
          <Upload className="h-4 w-4" /> New import
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Import Center — choose what kind of import */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Import Center</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <ImportCard href="/imports/new" icon={FileSpreadsheet} title="Spreadsheet Import" desc="Import contacts, records, or spreadsheet data." />
            <ImportCard href="/imports/new" icon={Columns3} title="Monday Import" desc="Import Monday-style boards and spreadsheet structures." />
            <ImportCard href="/blueprints" icon={FileJson} title="Blueprint Import" desc="Create boards, groups, fields, checklists, and status columns from a process blueprint." />
          </div>
        </section>

        {/* Quick-start templates */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quick start</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {IMPORT_TEMPLATES.map((t) => (
              <Link key={t.key} href={`/imports/new?template=${t.key}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-surface-1 px-3 py-2.5 hover:bg-surface-2 transition-colors">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-surface-2 text-muted-foreground">
                  <FileSpreadsheet className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{t.label}</p>
                  <p className="truncate text-2xs text-muted-foreground">{t.description}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* History */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">History</h2>
          {imports.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface-1 px-6 py-10 text-center">
              <p className="text-sm text-muted-foreground">No imports yet. Start with a template above.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="divide-y divide-border">
                {imports.map((imp) => {
                  const s = STATUS_STYLE[imp.status] ?? STATUS_STYLE.pending
                  const Icon = s.icon
                  return (
                    <div key={imp.id} className="flex items-center gap-4 px-4 py-3">
                      <Icon className={cn('h-4 w-4 flex-shrink-0', s.cls)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{imp.file_name}</p>
                        <p className="text-2xs text-muted-foreground">
                          {new Date(imp.created_at).toLocaleString()} · {imp.source_type.toUpperCase()}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 text-2xs text-muted-foreground">
                        <span className="text-jubo-green">{imp.imported_count} imported</span>
                        {imp.duplicate_count > 0 && <span className="text-jubo-gold">{imp.duplicate_count} dupes</span>}
                        {imp.failed_count > 0 && <span className="text-jubo-red">{imp.failed_count} failed</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ImportCard({ href, icon: Icon, title, desc }: { href: string; icon: React.ElementType; title: string; desc: string }) {
  return (
    <Link href={href} className="flex flex-col gap-2 rounded-xl border border-border bg-surface-1 p-4 hover:bg-surface-2 transition-colors">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-jubo-navy/10 text-jubo-navy"><Icon className="h-4.5 w-4.5" /></div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-2xs text-muted-foreground">{desc}</p>
    </Link>
  )
}
