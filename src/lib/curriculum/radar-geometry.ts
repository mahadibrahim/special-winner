/**
 * Pure SVG geometry for the domain radar (spider chart), Task 10 of the
 * curriculum-recovery plan. No DOM/React dependencies — safe to unit test
 * without a browser.
 */

/** One spoke of the radar: a domain's current level, and optionally its
 * level from the previous snapshot (for the dashed "previous" polygon). */
export interface RadarAxis {
  label: string;
  current: number;
  previous?: number;
}

/**
 * Sanitize an axis value for radar geometry: non-finite (NaN, Infinity)
 * becomes 0 (counts as "no data"), and values outside [0, max] are clamped.
 */
export function sanitizeAxisValue(value: number, max: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(value, max));
}

/**
 * Compute the [x, y] vertices of an N-axis radar polygon on a square
 * viewBox of size `size` (0..size in both dimensions), given raw `values`
 * scaled against `max`.
 *
 * Axis 0 is placed at the top (12 o'clock) and axes proceed clockwise.
 * A value of `max` lands exactly on the outer edge; a value of 0 lands at
 * the center, regardless of angle.
 *
 * Each value is sanitized before geometry computation: non-finite values
 * become 0, and out-of-range values are clamped to [0, max].
 */
export function radarPoints(values: number[], max: number, size: number): [number, number][] {
  const n = values.length;
  const center = size / 2;
  const maxRadius = size / 2;

  return values.map((value, i) => {
    const sanitized = sanitizeAxisValue(value, max);
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const radius = (sanitized / max) * maxRadius;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return [x, y];
  });
}
