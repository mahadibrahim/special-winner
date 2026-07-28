"use client";
import { useState, type ReactNode } from "react";
import { filterDivisions, groupDivisionsByDay, type Division, type DivisionFilters, type DayKey, type DivisionGender } from "@/lib/leagues/division-filters";
import { LevelLadder, Bars } from "@/components/leagues/level-ladder";
import { InterestCapture } from "@/components/leagues/interest-capture";
import { trackDivisionFilterApplied, trackDivisionRegisterClicked } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";

// Map internal filter keys to spec facet names.
const FACET_FOR: Record<keyof DivisionFilters, "level" | "format" | "day" | "venue"> = {
  level: "level",
  gender: "format",
  day: "day",
  venue: "venue",
};


const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" }, { key: "sun", label: "Sun" },
];
const GENDERS: { key: DivisionGender; label: string }[] = [
  { key: "coed", label: "Coed" }, { key: "mens", label: "Men's" }, { key: "womens", label: "Women's" },
];
const BARS_FOR: Record<string, number> = { a: 4, b: 3, c: 2, d: 1, open: 4 };
const TIER_TEXT: Record<string, string> = { a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage", open: "text-navy" };

export function registerHref(d: Division, mode: "individual" | "team" = "individual"): string | null {
  // Forming divisions capture interest in place (InterestCapture) — there is
  // no navigation target. The old return value here was a GET against the
  // POST-only season-interest endpoint: every click 405'd.
  if (d.status === "forming") return null;
  // Completed divisions are archive rows: a register link over a finished
  // season is a dead button (RegisterExperience refuses non-open anyway).
  if (d.status === "completed") return null;
  // The mode param skips the solo/team chooser on the register page. A row
  // only links a mode its season actually offers.
  if (!d.signupModes.includes(mode)) return null;
  return `/register/${d.seasonId}?mode=${mode}`;
}

export function DivisionsFinder({ divisions, venues, term, showLevels = true }: {
  divisions: Division[];
  venues: { slug: string; label: string }[];
  term: string;
  showLevels?: boolean;
}) {
  const [f, setF] = useState<DivisionFilters>({ level: null, gender: null, day: null, venue: null });
  const results = filterDivisions(divisions, f);
  const toggle = <K extends keyof DivisionFilters>(k: K, v: DivisionFilters[K]) => {
    trackDivisionFilterApplied({ facet: FACET_FOR[k], value: String(v), term });
    setF((prev) => ({ ...prev, [k]: prev[k] === v ? null : v }));
  };
  const clear = () => setF({ level: null, gender: null, day: null, venue: null });

  const chip = (active: boolean) =>
    cn("font-sans font-semibold text-[11px] px-2.5 py-1.5 rounded-full border cursor-pointer",
      active ? "bg-ink text-cream border-ink" : "bg-paper text-ink-muted border-cream-3");

  return (
    <div>
      {showLevels && (
        <div className="mb-4">
          <LevelLadder selected={f.level} onSelect={(k) => toggle("level", k as DivisionFilters["level"])} />
        </div>
      )}

      <div className="flex flex-wrap gap-4 items-center p-3 bg-cream-2 rounded-xl">
        <FilterGroup label="Format">
          {GENDERS.map((g) => (
            <button key={g.key} className={chip(f.gender === g.key)} onClick={() => toggle("gender", g.key)}>{g.label}</button>
          ))}
        </FilterGroup>
        <FilterGroup label="Night">
          {DAYS.map((d) => (
            <button key={d.key} className={chip(f.day === d.key)} onClick={() => toggle("day", d.key)}>{d.label}</button>
          ))}
        </FilterGroup>
        <FilterGroup label="Venue">
          {venues.map((v) => (
            <button key={v.slug} className={chip(f.venue === v.slug)} onClick={() => toggle("venue", v.slug)}>{v.label}</button>
          ))}
        </FilterGroup>
      </div>

      <p className="font-mono text-[11px] text-ink-muted my-3">
        <span data-testid="result-count">{results.length}</span> divisions open
        <button className="text-primary ml-2" onClick={clear}>· clear filters</button>
      </p>

      {results.length === 0 ? (
        <div className="p-7 border border-dashed border-cream-3 rounded-xl">
          <p className="text-center text-ink-muted text-sm mb-3">No divisions match those filters — try clearing one.</p>
          {/* No seasonId: nothing specific to point season-interest at — this
              feeds the newsletter list tagged with the slot source. */}
          <InterestCapture
            compact
            source="divisions-empty-state"
            title="Tell me when a matching division opens"
            subtitle="One email when new divisions are announced — nothing else."
          />
        </div>
      ) : (
        <div className="border-t border-cream-3" data-testid="division-rows">
          {groupDivisionsByDay(results).map((g) => (
            <div key={g.day ?? "tbd"} data-testid="division-day-group">
              <h3 className="font-mono text-[11px] tracking-widest uppercase text-primary pt-4 pb-1.5 border-b border-cream-3">
                {g.label} <span className="text-ink-muted">· {g.items.length}</span>
              </h3>
              {g.items.map((d) => <DivisionRow key={d.id} d={d} term={term} showLevels={showLevels} />)}
            </div>
          ))}
        </div>
      )}
      <p className="font-mono text-[10px] tracking-wide uppercase text-ink-muted mt-3.5">
        Age divisions · 30+ and 40+ also available at Worthington
      </p>
    </div>
  );
}

function DivisionRow({ d, term, showLevels }: { d: Division; term: string; showLevels: boolean }) {
  const [capturing, setCapturing] = useState(false);
  const track = (mode: "team" | "individual" | "interest") =>
    trackDivisionRegisterClicked({ seasonId: d.seasonId, level: d.level, gender: d.gender, venue: d.venueSlug, mode, term });
  const teamHref = registerHref(d, "team");
  const soloHref = registerHref(d, "individual");
  const ctaClass = (primary: boolean) =>
    cn("font-sans font-semibold text-xs px-3.5 py-2 rounded-md whitespace-nowrap text-center sm:text-left",
      primary ? "text-cream bg-primary" : "text-primary border border-primary");
  return (
    <>
      <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-[30px_1.6fr_1.2fr_0.9fr_0.8fr_auto] sm:items-center sm:gap-3.5 py-3 px-2 border-b border-cream-2 hover:bg-paper">
        {showLevels && <Bars filled={BARS_FOR[d.level]} flat={d.level === "open"} className={TIER_TEXT[d.level]} />}
        <div>
          <div className="font-display font-semibold text-base">{d.name}</div>
          <div className="font-mono text-[10.5px] tracking-wide uppercase text-ink-muted mt-0.5">
            {d.gender === "mens" ? "Men's" : d.gender === "womens" ? "Women's" : "Coed"}
            {showLevels && <> · Level {d.level.toUpperCase()}</>}
            {/* Solo price up front — paid-traffic replays showed price-hunters
                tapping Register just to learn the cost, then bouncing. */}
            {d.price != null && d.status !== "completed" && (
              <> · <span className="text-ink font-semibold">${d.price.toLocaleString()}/player</span></>
            )}
          </div>
          {d.teamTotal != null && d.status !== "completed" && (
            <div className="font-mono text-[10.5px] tracking-wide text-ink-muted mt-0.5">
              or reserve a team — ${CAPTAIN_DEPOSIT_DOLLARS} down, ${d.teamTotal.toLocaleString()} total
            </div>
          )}
        </div>
        <div className="text-[13px] text-ink-2">{d.day ? <b className="text-ink">{labelDay(d.day)}</b> : null} {d.time ? `· ${d.time}` : ""}</div>
        <div className="text-xs text-ink-muted">{d.venueName}</div>
        <div className={cn("font-mono text-[11px] font-semibold", d.status === "forming" ? "text-ochre" : "text-sage")}>{d.spotsLabel}</div>
        {d.status === "completed" ? (
          <span className="font-mono text-[10px] tracking-wide uppercase text-ink-muted mt-1.5 sm:mt-0">Season complete</span>
        ) : d.status === "forming" ? (
          <button type="button" aria-expanded={capturing}
            onClick={() => { track("interest"); setCapturing((v) => !v); }}
            className={cn(ctaClass(false), "mt-1.5 sm:mt-0")}>
            Notify me
          </button>
        ) : (
          /* One action per offered mode — the hero CTA no longer picks a
             mode, so the row is where team vs solo is decided. */
          <div className="flex sm:flex-col xl:flex-row gap-1.5 mt-1.5 sm:mt-0">
            {teamHref && (
              <a href={teamHref} onClick={() => track("team")} className={ctaClass(true)}>
                Register team →
              </a>
            )}
            {soloHref && (
              <a href={soloHref} onClick={() => track("individual")} className={ctaClass(!teamHref)}>
                Join solo →
              </a>
            )}
          </div>
        )}
      </div>
      {capturing && (
        <div className="py-2.5 px-2 border-b border-cream-2">
          <InterestCapture
            compact
            seasonId={d.seasonId}
            source="division-forming"
            title={`Get notified when ${d.name} opens`}
            subtitle="One email the day registration opens — nothing else."
          />
        </div>
      )}
    </>
  );
}

function FilterGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function labelDay(d: string) {
  return ({ mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" } as Record<string, string>)[d] ?? d;
}
