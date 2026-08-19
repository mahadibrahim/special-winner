"use client"
// One row per open division — the direct-booking surface of the youth
// league pages (design: 2026-08-18 two-path mockup). Rows come from
// divisionRowModel so economics/CTA logic stays unit-tested and shared
// with the server-rendered inline rows in the type cards.
import type { DivisionRowModel } from "@/lib/leagues/division-row-model"

export function YouthDivisionTable({
  rows,
  onBook,
}: {
  rows: DivisionRowModel[]
  onBook?: (id: string) => void
}) {
  return (
    <div>
      {/* Header row hides on small screens; rows collapse to two columns. */}
      <div className="hidden sm:grid grid-cols-[1.1fr_1.7fr_1.1fr_0.9fr_auto] gap-3.5 items-center px-1.5 py-3 border-b border-cream-2 font-mono text-[9.5px] tracking-[0.14em] uppercase text-ink-muted text-left">
        <span>Age group</span><span>Season</span><span>Day &amp; start</span><span>Price</span><span />
      </div>
      <ul role="list">
        {rows.map((row) => (
          <li
            key={row.id}
            className="grid grid-cols-[1fr_auto] sm:grid-cols-[1.1fr_1.7fr_1.1fr_0.9fr_auto] gap-1.5 sm:gap-3.5 items-center px-1.5 py-3.5 border-b border-cream-3 last:border-b-0 text-left"
            data-division-row={row.kind}
          >
            <span>
              <span className="font-display font-semibold text-[19px] text-ink">{row.group}</span>
              <span
                className={`font-mono text-[9px] tracking-[0.1em] uppercase rounded-md px-2 py-[3px] ml-2 align-[2px] ${
                  row.kind === "competitive"
                    ? "bg-royal/10 text-royal"
                    : "bg-emerald/15 text-emerald"
                }`}
              >
                {row.kindLabel}
              </span>
            </span>
            <span className="text-[13.5px] text-ink-2">
              {row.seasonName}
              {/* Count only — no "team spots" variant. row.spotsLeft is already
                  null on team rows (there is no team-capacity column to count
                  against), so this line is individual-row scarcity only. */}
              {row.spotsLeft != null && !row.soldOut && (
                <span className="block font-mono text-[9.5px] tracking-[0.08em] uppercase text-brand-red mt-0.5">
                  ● {row.spotsLeft} spots left
                </span>
              )}
            </span>
            <span className="text-[13px] text-ink-2">{row.meta}</span>
            <span className="font-display font-semibold text-[19px] text-ink">
              ${row.price.toLocaleString()}
              {row.basePrice != null && (
                <s className="font-sans font-normal text-[12px] text-ink-muted ml-1.5">
                  ${row.basePrice.toLocaleString()}
                </s>
              )}
              <small className="block font-sans font-normal text-[10.5px] text-ink-muted">
                {row.priceUnit}
              </small>
            </span>
            {/* Sold out is a state, not a destination — a link into checkout
                for a division with nothing left is a CTA the catalog cannot
                honour, so it renders as a muted non-interactive pill. */}
            {row.soldOut ? (
              <span className="font-mono text-[10.5px] tracking-[0.1em] uppercase rounded-lg px-3.5 py-2.5 bg-cream-2 text-ink-muted border border-cream-3 whitespace-nowrap justify-self-end">
                Sold out
              </span>
            ) : (
              <a
                href={row.href}
                onClick={() => onBook?.(row.id)}
                className={`font-mono text-[10.5px] tracking-[0.1em] uppercase rounded-lg px-3.5 py-2.5 text-cream no-underline whitespace-nowrap justify-self-end ${
                  row.kind === "competitive" ? "bg-royal" : "bg-brand-red"
                }`}
              >
                {row.cta}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
