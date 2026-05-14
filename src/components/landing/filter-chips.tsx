"use client"

export interface ChipOption {
  value: string
  label: string
  count: number
}

interface FilterChipsProps {
  label: string
  options: ChipOption[]
  active: string | null
  onChange: (value: string | null) => void
}

/**
 * Single-select chip filter row for one dimension (Sport, Venue, Day, …).
 * `null` active means "All". Auto-hides when there is nothing to choose
 * between (zero or one option). Editorial cream styling — shared by every
 * section of the /adult finder.
 */
export function FilterChips({ label, options, active, onChange }: FilterChipsProps) {
  if (options.length <= 1) return null

  const chipClass = (selected: boolean) =>
    `text-xs px-3 py-1.5 rounded-full border transition-colors ${
      selected
        ? "bg-ink text-cream border-ink"
        : "bg-paper text-ink-2 border-border hover:border-ink-muted"
    }`

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] font-semibold tracking-[0.1em] uppercase text-ink-muted mr-1">
        {label}
      </span>
      <button type="button" onClick={() => onChange(null)} className={chipClass(active === null)}>
        All
      </button>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(active === opt.value ? null : opt.value)}
          className={chipClass(active === opt.value)}
        >
          {opt.label}
          <span className="opacity-50 ml-1">{opt.count}</span>
        </button>
      ))}
    </div>
  )
}
