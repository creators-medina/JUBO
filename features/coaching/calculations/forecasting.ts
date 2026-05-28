// ─────────────────────────────────────────────────────────────────────────
// Forecasting — dynamic projections from measured behavior. Pure, no I/O.
// Interface kept swappable so a future AI forecaster can replace the body.
// ─────────────────────────────────────────────────────────────────────────

import type { Forecast } from '../types'

/**
 * Consistency 0..1 from a daily series (1 = evenly distributed activity).
 * Uses coefficient of variation; steadier effort forecasts more reliably.
 */
export function consistencyFromSeries(series: number[]): number {
  if (series.length === 0) return 0
  const mean = series.reduce((a, b) => a + b, 0) / series.length
  if (mean <= 0) return 0
  const variance = series.reduce((a, b) => a + (b - mean) ** 2, 0) / series.length
  const cv = Math.sqrt(variance) / mean
  return Math.max(0, Math.min(1, 1 - cv / 2))
}

/**
 * Project a metric to period end from current pace, nudged by consistency.
 * Steady performers project on their run-rate; erratic ones are discounted.
 */
export function buildForecast(input: {
  metric: Forecast['metric']
  label: string
  current: number
  target: number
  daysElapsed: number
  daysInPeriod: number
  consistency?: number
}): Forecast {
  const { metric, label, current, target, daysInPeriod } = input
  const daysElapsed = Math.max(1, input.daysElapsed)
  const consistency = input.consistency ?? 1
  const runRate = current / daysElapsed
  // Discount erratic activity slightly (down to -20% at zero consistency).
  const adjustment = 0.8 + 0.2 * consistency
  const projected = runRate * daysInPeriod * adjustment
  const variancePercent = target > 0 ? ((projected - target) / target) * 100 : 0
  return {
    metric,
    label,
    current: Math.round(current * 100) / 100,
    target: Math.round(target * 100) / 100,
    projected: Math.round(projected * 100) / 100,
    variancePercent: Math.round(variancePercent),
    onTrack: variancePercent >= -10,
    consistency: Math.round(consistency * 100) / 100,
  }
}
