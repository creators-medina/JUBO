import { LoadingState } from '@/components/primitives/LoadingState'

export default function Loading() {
  return (
    <div className="space-y-4 p-6">
      <div className="h-9 w-56 animate-pulse rounded-lg bg-surface-1" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-lg bg-surface-1" />
        ))}
      </div>
      <LoadingState rows={5} />
    </div>
  )
}
