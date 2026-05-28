import { LoadingState } from '@/components/primitives/LoadingState'

export default function Loading() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="h-8 w-48 animate-pulse rounded-lg bg-surface-1" />
      <LoadingState rows={6} />
    </div>
  )
}
