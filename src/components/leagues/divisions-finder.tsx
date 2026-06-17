"use client";
import { useState, type ReactNode } from "react";
import { filterDivisions, type Division, type DivisionFilters, type DayKey, type DivisionGender } from "@/lib/leagues/division-filters";
import { LevelLadder, Bars } from "@/components/leagues/level-ladder";
import { cn } from "@/lib/utils";

const DAYS: { key: DayKey; label: string }[] = [
  { key: "mon", label: "Mon" }, { key: "tue", label: "Tue" }, { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" }, { key: "fri", label: "Fri" }, { key: "sun", label: "Sun" },
];
const GENDERS: { key: DivisionGender; label: string }[] = [
  { key: "coed", label: "Coed" }, { key: "mens", label: "Men's" }, { key: "womens", label: "Women's" },
];
const BARS_FOR: Record<string, number> = { a: 4, b: 3, c: 2, d: 1, open: 4 };
const TIER_TEXT: Record<string, string> = { a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage", open: "text-navy" };

function registerHref(d: Division): string {
  if (d.status === "forming") return `/api/public/season-interest?seasonId=${d.seasonId}`;
  return d.signupModes.includes("team") ? `/register/team/${d.seasonId}` : `/register/${d.seasonId}`;
}

export function DivisionsFinder({ divisions, venues }: {
  divisions: Division[];
  venues: { slug: string; label: string }[];
}) {
  const [f, setF] = useState<DivisionFilters>({ level: null, gender: null, day: null, venue: null });
  const results = filterDivisions(divisions, f);
  const toggle = <K extends keyof DivisionFilters>(k: K, v: DivisionFilters[K]) =>
    setF((prev) => ({ ...prev, [k]: prev[k] === v ? null : v }));
  const clear = () => setF({ level: null, gender: null, day: null, venue: null });

  const chip = (active: boolean) =>
    cn("font-sans font-semibold text-[11px] px-2.5 py-1.5 rounded-full border cursor-pointer",
      active ? "bg-ink text-cream border-ink" : "bg-paper text-ink-muted border-cream-3");

  return (
    <div>
      <div className="mb-4">
        <LevelLadder selected={f.level} onSelect={(k) => toggle("level", k as DivisionFilters["level"])} />
      </div>

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
        <div className="p-7 text-center text-ink-muted text-sm border border-dashed border-cream-3 rounded-xl">
          No divisions match those filters — try clearing one.{" "}
          <a className="text-primary font-semibold" href="#interest">Join the interest list →</a>
        </div>
      ) : (
        <div className="border-t border-cream-3" data-testid="division-rows">
          {results.map((d) => (
            <div key={d.id} className="grid grid-cols-[30px_1.6fr_1.2fr_0.9fr_0.8fr_auto] items-center gap-3.5 py-3 px-2 border-b border-cream-2 hover:bg-paper">
              <Bars filled={BARS_FOR[d.level]} className={TIER_TEXT[d.level]} />
              <div>
                <div className="font-display font-semibold text-base">{d.name}</div>
                <div className="font-mono text-[10.5px] tracking-wide uppercase text-ink-muted mt-0.5">
                  {d.gender === "mens" ? "Men's" : d.gender === "womens" ? "Women's" : "Coed"} · Level {d.level.toUpperCase()}
                </div>
              </div>
              <div className="text-[13px] text-ink-2">{d.day ? <b className="text-ink">{labelDay(d.day)}</b> : null} {d.time ? `· ${d.time}` : ""}</div>
              <div className="text-xs text-ink-muted">{d.venueName}</div>
              <div className={cn("font-mono text-[11px] font-semibold", d.status === "forming" ? "text-ochre" : "text-sage")}>{d.spotsLabel}</div>
              <a href={registerHref(d)}
                 className={cn("font-sans font-semibold text-xs px-3.5 py-2 rounded-md whitespace-nowrap",
                   d.status === "forming" ? "text-primary border border-primary" : "text-cream bg-primary")}>
                {d.status === "forming" ? "Notify me" : "Register →"}
              </a>
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
