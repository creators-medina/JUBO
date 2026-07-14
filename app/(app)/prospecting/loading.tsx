export default function Loading() {
  // Skeleton mirrors the cockpit: navy hero → week strip → today's list.
  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-8 lg:px-10">
      <div className="h-[360px] animate-pulse rounded-2xl bg-jubo-navy/90" />
      <div className="grid grid-cols-5 gap-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-xl border border-border bg-surface-1" />
        ))}
      </div>
      <div className="animate-pulse overflow-hidden rounded-2xl border border-border bg-surface-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 border-b border-border/60 bg-card/60" />
        ))}
      </div>
    </div>
  )
}
