import { trackEvent } from './actions'

/** Fire-and-forget client-side product event. Non-blocking; swallows errors. */
export function track(event: string, props?: Record<string, unknown>): void {
  void trackEvent(event, props ?? {})
}
