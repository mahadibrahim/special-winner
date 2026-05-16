"use client"

/**
 * Free space block — the visual signal that a time slot is unbooked and
 * bookable. Diagonal stripe pattern on cream, muted text. Per the spec,
 * free space is visually distinct from "nothing scheduled" (no slot) so
 * the venue manager can immediately see open inventory.
 */
export function FreeSpaceBlock({ note }: { note: string }) {
  return (
    <div
      className="flex items-center px-3 py-2 rounded text-xs italic text-ink-muted min-h-[44px]"
      style={{
        backgroundImage:
          "repeating-linear-gradient(45deg, #fafafa, #fafafa 6px, #f5f1e8 6px, #f5f1e8 12px)",
      }}
    >
      {note}
    </div>
  )
}
