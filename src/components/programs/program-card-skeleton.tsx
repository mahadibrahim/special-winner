/**
 * Loading placeholder for the canonical card family (`ProgramCardV2` /
 * `PickupCard`, both rendered through `CardShell`). Mirrors the shell's
 * structural classes row-for-row — media band, clamped title area, three
 * meta rows, fixed chip slot, spacer, footer band — so its height derives
 * from the SAME classes as the real card instead of a hardcoded px guess.
 * See docs/superpowers/plans/2026-07-23-card-system-consolidation.md, Task 3.
 *
 * Renders `PAGE_SIZE`-agnostic: callers map an array of indices to this
 * component the same way they'd map seasons/sessions to `ProgramCardV2`.
 */
export function ProgramCardSkeleton() {
  return (
    <div
      className="relative h-full flex flex-col bg-paper border border-border rounded-2xl overflow-hidden"
      aria-hidden="true"
    >
      {/* Media band — same fixed height as CardShell's media slot. */}
      <div className="h-28 flex-shrink-0 bg-border/40 animate-pulse" />

      <div className="flex flex-col flex-1 p-4">
        {/* Title — same reserved 2-line clamp height as CardBody's <h3>. */}
        <div className="flex flex-col justify-center gap-1.5 min-h-[2.5rem]">
          <div className="h-3.5 w-4/5 rounded bg-border/40 animate-pulse" />
          <div className="h-3.5 w-3/5 rounded bg-border/40 animate-pulse" />
        </div>

        {/* Meta rows A-C — same mt-2/mt-1/mt-1 rhythm as CardBody. */}
        <div className="flex items-center gap-1.5 mt-2">
          <div className="h-3 w-3/4 rounded bg-border/30 animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="h-3 w-1/2 rounded bg-border/30 animate-pulse" />
        </div>
        <div className="flex items-center gap-1.5 mt-1">
          <div className="h-3 w-2/3 rounded bg-border/30 animate-pulse" />
        </div>

        {/* Fixed-height chip slot */}
        <div className="mt-2 min-h-[1.375rem] flex items-center gap-1.5">
          <div className="h-4 w-16 rounded-full bg-border/30 animate-pulse" />
        </div>

        {/* Spacer — pushes the footer band to the same bottom position. */}
        <div className="flex-1 min-h-[0.75rem]" />

        {/* Price band + CTA band */}
        <div className="pt-3 border-t border-border flex items-end justify-between">
          <div className="h-5 w-14 rounded bg-border/40 animate-pulse" />
          <div className="h-8 w-20 rounded-md bg-border/40 animate-pulse" />
        </div>
      </div>
    </div>
  )
}
