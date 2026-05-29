'use client'

import { useEffect } from 'react'
import { track } from './client'

/** Drop-in page-view beacon. Renders nothing; fires once per surface mount. */
export function TrackView({ surface }: { surface: string }) {
  useEffect(() => { track('page_view', { surface }) }, [surface])
  return null
}
