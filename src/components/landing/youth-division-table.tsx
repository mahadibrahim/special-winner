"use client"
// One row per open division — the direct-booking surface of the youth
// league pages (design: 2026-08-18 two-path mockup). Rows come from
// divisionRowModel so economics/CTA logic stays unit-tested and shared
// with the server-rendered inline rows in the type cards.
//
// A row can carry TWO doors. Winter club inventory is dual-mode (a whole team
// can enter AND one kid can join), so the row renders a pill per available
// path — team first, because on a competitive division the club entry is the
// headline product and the solo pill is the "just my kid" escape hatch.
import type { DivisionPath, DivisionRowModel } from "@/lib/leagues/division-row-model"

const PILL =
  "font-mono text-[10.5px] tracking-[0.1em] uppercase rounded-lg px-3.5 py-2.5 text-cream no-underline whitespace-nowrap"

function money(n: number): string {
  return `$${n.toLocaleString()}`
}

export function YouthDivisionTable({
  rows,
  onBook,
}: {
  rows: DivisionRowModel[]
  onBook?: (id: string, mode: "individual" | "team") => void
}) {
  return (
    <div>
      {/* Header row hides on small screens; rows collapse to two columns. */}
      <div className="hidden sm:grid grid-cols-[1.1fr_1.7fr_1.1fr_0.9fr_auto] gap-3.5 items-center px-1.5 py-3 border-b border-cream-2 font-mono text-[9.5px] tracking-[0.14em] uppercase text-ink-muted text-left">
        <span>Age group</span><span>Season</span><span>Day &amp; start</span><span>Price</span><span />
      </div>
      <ul role="list">
        {rows.map((row) => {
          // The large number is the price of the door most visitors take: the
          // per-kid price wherever a solo door exists, otherwise the team fee.
          const lead: DivisionPath = (row.solo ?? row.team) as DivisionPath
          const leadUnit = row.solo ? "per kid" : "per team"
          // Rendered as a second, smaller line only when both doors exist.
          const secondary = row.solo && row.team ? row.team : null
          return (
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
                    null on rows with no solo door (there is no team-capacity
                    column to count against), so this line is player scarcity only. */}
                {row.spotsLeft != null && !row.soldOut && (
                  <span className="block font-mono text-[9.5px] tracking-[0.08em] uppercase text-brand-red mt-0.5">
                    ● {row.spotsLeft} spots left
                  </span>
                )}
              </span>
              <span className="text-[13px] text-ink-2">{row.meta}</span>
              <span className="font-display font-semibold text-[19px] text-ink">
                {money(lead.price)}
                {lead.basePrice != null && (
                  <s className="font-sans font-normal text-[12px] text-ink-muted ml-1.5">
                    {money(lead.basePrice)}
                  </s>
                )}
                <small className="block font-sans font-normal text-[10.5px] text-ink-muted">
                  {leadUnit}
                </small>
                {secondary && (
                  <small className="block font-sans font-normal text-[11px] text-ink-2 mt-1">
                    {money(secondary.price)}
                    {secondary.basePrice != null && (
                      <s className="text-ink-muted ml-1">{money(secondary.basePrice)}</s>
                    )}{" "}
                    <span className="text-ink-muted">per team</span>
                  </small>
                )}
              </span>
              {/* Sold out is a state, not a destination — a link into checkout
                  for a division with nothing left is a CTA the catalog cannot
                  honour, so every pill collapses to a muted non-interactive one. */}
              {row.soldOut ? (
                <span className="font-mono text-[10.5px] tracking-[0.1em] uppercase rounded-lg px-3.5 py-2.5 bg-cream-2 text-ink-muted border border-cream-3 whitespace-nowrap justify-self-end">
                  Sold out
                </span>
              ) : (
                <span className="flex flex-wrap gap-1.5 justify-self-end justify-end">
                  {row.team && (
                    <a
                      href={row.team.href}
                      onClick={() => onBook?.(row.id, "team")}
                      data-division-cta="team"
                      className={`${PILL} bg-royal`}
                    >
                      {row.team.cta}
                    </a>
                  )}
                  {row.solo && (
                    <a
                      href={row.solo.href}
                      onClick={() => onBook?.(row.id, "individual")}
                      data-division-cta="solo"
                      className={`${PILL} bg-brand-red`}
                    >
                      {row.solo.cta}
                    </a>
                  )}
                </span>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
