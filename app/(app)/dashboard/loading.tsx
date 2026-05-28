import { LoadingState } from '@/components/primitives/LoadingState'

export default function Loading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-1" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-xl bg-surface-1" style={{ opacity: 1 - i * 0.12 }} />
        ))}
      </div>
    </div>
  )
}
