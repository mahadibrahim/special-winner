"use client";
import { useEffect, useState } from "react";
import { DivisionsFinder } from "@/components/leagues/divisions-finder";
import { StandingsPanel } from "@/components/leagues/standings-panel";
import type { Division } from "@/lib/leagues/division-filters";
import { groupDivisionsByDay } from "@/lib/leagues/division-filters";
import type { RuleSection, FaqEntry } from "@/lib/leagues/landing-content";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { trackSeasonViewed } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

type Tab = "divisions" | "schedule" | "standings" | "rules" | "faq";
const TABS: { key: Tab; label: string }[] = [
  { key: "divisions", label: "Divisions & Times" }, { key: "schedule", label: "Schedule" },
  { key: "standings", label: "Standings" }, { key: "rules", label: "Rules" }, { key: "faq", label: "FAQ" },
];

export function SeasonTabs({
  sport,
  divisions,
  venues,
  weekStart,
  scheduleNote,
  term,
  ruleSections,
  faq,
  arenaNote,
  showLevels,
  initialTab = "divisions",
}: {
  sport: string;
  divisions: Division[];
  venues: { slug: string; label: string }[];
  weekStart: string;
  scheduleNote: string;
  term: string;
  ruleSections: RuleSection[];
  faq: FaqEntry[];
  arenaNote: { title: string; body: string } | null;
  showLevels?: boolean;
  /** A fully-completed term opens on Standings — the archive is the content. */
  initialTab?: Tab;
}) {
  useHydrationBeacon();
  const [tab, setTab] = useState<Tab>(initialTab);
  useEffect(() => {
    trackSeasonViewed({ sport, term });
  }, [sport, term]);
  return (
    <div>
      <div className="bg-navy-deep px-9">
        <div className="max-w-[1080px] mx-auto flex gap-0.5">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              aria-selected={tab === t.key}
              className={cn("font-mono text-xs tracking-wider uppercase px-4 py-3.5 cursor-pointer relative top-px",
                tab === t.key ? "bg-cream text-ink rounded-t-lg" : "text-cream/70")}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-cream min-h-[340px] px-9 py-6">
        <div className="max-w-[1080px] mx-auto">
          <div hidden={tab !== "divisions"}>
            <>
              <h2 className="font-display font-semibold text-2xl">Find your level &amp; register</h2>
              <p className="text-ink-muted text-[13px] mt-0.5 mb-1.5">Pick your level, then narrow by format, night, or venue. Open divisions register on the spot.</p>
              {/* Pre-answer the two exits replays showed: "do I need an
                  account?" and "how long will this take?" */}
              <p className="font-mono text-[10.5px] tracking-wide uppercase text-sage mb-4">
                No account needed · registering takes about 3 minutes
              </p>
              <DivisionsFinder divisions={divisions} venues={venues} term={term} showLevels={showLevels ?? true} />

              {/* What to expect + the questions replays showed people leaving
                  the flow to answer. Inline so info-seeking doesn't mean
                  losing the page (most who left never came back). */}
              <div className="mt-10 grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="font-mono text-[11px] tracking-widest uppercase text-primary mb-3">What to expect</h3>
                  <ol className="space-y-2.5">
                    {[
                      ["Register", "Solo or with your team — about 3 minutes, pay online."],
                      ["Get your schedule", "Divisions lock, then your team & game times land in your inbox."],
                      ["Play", "One game a week, 7 games, indoor — rain or shine."],
                    ].map(([t, d], i) => (
                      <li key={t} className="flex gap-3 text-[13px]">
                        <span className="font-display font-semibold text-primary">{i + 1}</span>
                        <span><b className="text-ink">{t}</b> <span className="text-ink-muted">— {d}</span></span>
                      </li>
                    ))}
                  </ol>
                </div>
                <div>
                  <h3 className="font-mono text-[11px] tracking-widest uppercase text-primary mb-3">Quick answers</h3>
                  <div className="divide-y divide-cream-3 border-y border-cream-3">
                    {faq.slice(0, 4).map((f) => (
                      <details key={f.q} className="group py-2.5">
                        <summary className="cursor-pointer list-none flex items-baseline justify-between gap-3 text-[13px] font-semibold text-ink">
                          {f.q}
                          <span className="text-ink-faint group-open:rotate-45 transition-transform">+</span>
                        </summary>
                        <p className="text-[13px] text-ink-2 mt-1.5">{f.a}</p>
                      </details>
                    ))}
                  </div>
                </div>
              </div>
            </>
          </div>
          <div hidden={tab !== "schedule"}>
            <>
              <h2 className="font-display font-semibold text-2xl">When games run</h2>
              <p className="text-ink-muted text-[13px] mt-0.5 mb-4">{scheduleNote}</p>
              <ScheduleTable divisions={divisions} />
            </>
          </div>
          {tab === "standings" && (
            <StandingsPanel divisions={divisions} weekStart={weekStart} term={term} />
          )}
          <div hidden={tab !== "rules"}>
            <>
              <h2 className="font-display font-semibold text-2xl">Rules &amp; regulations</h2>
              {arenaNote && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-xs text-ink-2 my-4">
                  <strong>{arenaNote.title}</strong> {arenaNote.body}
                </div>
              )}
              <div className="grid md:grid-cols-2 gap-x-7 gap-y-3.5">
                {ruleSections.map((s) => (
                  <div key={s.title}>
                    <h3 className="font-mono text-[13px] tracking-wider uppercase text-primary mb-2 pb-1.5 border-b border-cream-3">{s.title}</h3>
                    <ul className="space-y-1">
                      {s.items.map((it) => <li key={it} className="text-[12.5px] text-ink-2 leading-snug pl-4 relative before:content-['›'] before:absolute before:left-0 before:text-primary before:font-bold">{it}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </>
          </div>
          <div hidden={tab !== "faq"}>
            <>
              <h2 className="font-display font-semibold text-2xl">Common questions</h2>
              <div className="grid md:grid-cols-2 gap-x-7 gap-y-3.5 mt-4">
                {faq.map((e) => (
                  <div key={e.q}>
                    <h3 className="font-mono text-[13px] tracking-wider uppercase text-primary mb-2 pb-1.5 border-b border-cream-3">{e.q}</h3>
                    <p className="text-[12.5px] text-ink-2 leading-snug">{e.a}</p>
                  </div>
                ))}
              </div>
            </>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScheduleTable({ divisions }: { divisions: Division[] }) {
  // Dated day groups only — the schedule table omits day-TBD divisions.
  const byDay = groupDivisionsByDay(divisions).filter((g) => g.day !== null);
  if (byDay.length === 0) return <p className="text-ink-muted text-sm">Schedule posts once divisions are set.</p>;
  return (
    <table className="w-full text-[13px] border-collapse">
      <thead><tr><th className="text-left font-mono text-[10px] tracking-widest uppercase text-ink-muted py-2 px-2.5 border-b border-cream-3">Night</th><th className="text-left font-mono text-[10px] tracking-widest uppercase text-ink-muted py-2 px-2.5 border-b border-cream-3">Divisions</th></tr></thead>
      <tbody>
        {byDay.map((r) => (
          <tr key={r.day}>
            <td className="py-2.5 px-2.5 border-b border-cream-2 font-semibold text-ink uppercase">{r.label}</td>
            <td className="py-2.5 px-2.5 border-b border-cream-2 text-ink-2">{r.items.map((d) => `${d.name}${d.time ? ` (${d.time})` : ""}`).join(" · ")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
