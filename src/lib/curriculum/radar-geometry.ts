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
 * Compute the [x, y] vertices of an N-axis radar polygon on a square
 * viewBox of size `size` (0..size in both dimensions), given raw `values`
 * scaled against `max`.
 *
 * Axis 0 is placed at the top (12 o'clock) and axes proceed clockwise.
 * A value of `max` lands exactly on the outer edge; a value of 0 lands at
 * the center, regardless of angle.
 */
export function radarPoints(values: number[], max: number, size: number): [number, number][] {
  const n = values.length;
  const center = size / 2;
  const maxRadius = size / 2;

  return values.map((value, i) => {
    const angle = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const radius = (value / max) * maxRadius;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return [x, y];
  });
}
