/**
 * Clamp a user-supplied ?limit= query param to [1, max], falling back to
 * `fallback` when absent or non-numeric. Every coach endpoint that paginates
 * must use this — unclamped parseInt() lets a caller demand the whole table.
 */
export function clampLimit(raw: string | null, fallback: number, max = 100): number {
  const n = raw === null ? NaN : parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), max);
}
