'use client'

export function StepShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl px-6 py-12 sm:py-16">
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{title}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
      </div>
      {footer && (
        <div className="flex-shrink-0 border-t border-border bg-surface-1/60 backdrop-blur">
          <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-6 py-4">
            {footer}
          </div>
        </div>
      )}
    </div>
  )
}
