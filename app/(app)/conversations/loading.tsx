export default function Loading() {
  return (
    <div className="flex h-full overflow-hidden">
      <div className="w-full flex-shrink-0 border-r border-border md:w-80">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="border-b border-border px-4 py-3" style={{ opacity: 1 - i * 0.13 }}>
            <div className="h-3.5 w-32 animate-pulse rounded bg-surface-1" />
            <div className="mt-2 h-3 w-40 animate-pulse rounded bg-surface-1" />
          </div>
        ))}
      </div>
      <div className="hidden flex-1 items-center justify-center text-xs text-muted-foreground md:flex">Loading conversations…</div>
    </div>
  )
}
