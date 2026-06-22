"use client";
import { useEffect, useState } from "react";
import { LevelLadder } from "@/components/leagues/level-ladder";
import { WHY_INDOOR, RULE_SECTIONS } from "@/lib/leagues/adult-soccer-content";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { trackLandingTabViewed, trackLandingCtaClicked } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

export type LandingTerm = { slug: string; label: string; meta: string };
type CurrentTerm = LandingTerm & { dateLine: string; divisions: number; venues: number };
type UpcomingTerm = LandingTerm & { opensLabel: string };
type Props = { current: CurrentTerm | null; upcoming: UpcomingTerm[]; past: LandingTerm[] };
type Tab = "overview" | "this" | "upcoming" | "past";
const TINT: Record<string, string> = { orange: "bg-primary/20", sage: "bg-sage/25", ochre: "bg-ochre/20" };
const ORANGE = "oklch(0.66 0.21 35)";

export function SoccerLandingTabs({ current, upcoming, past }: Props) {
  useHydrationBeacon();
  const [tab, setTab] = useState<Tab>("overview");
  useEffect(() => {
    trackLandingTabViewed({ sport: "soccer", tab });
  }, [tab]);
  const tabs: { key: Tab; label: string; badge?: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "this", label: "This Season" },
    { key: "upcoming", label: "Upcoming", badge: upcoming.length ? String(upcoming.length) : undefined },
    { key: "past", label: "Past" },
  ];
  return (
    <div>
      <div className="bg-navy-deep px-9">
        <div className="max-w-[1080px] mx-auto flex gap-0.5">
          {tabs.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)} aria-selected={tab === t.key}
              className={cn("font-mono text-xs tracking-wider uppercase px-4 py-3.5 cursor-pointer relative top-px flex items-center gap-1.5",
                tab === t.key ? "bg-cream text-ink rounded-t-lg" : "text-cream/70")}>
              {t.label}{t.badge && <span className="text-[9px] bg-primary/25 text-primary-foreground rounded-full px-1.5 py-px">{t.badge}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-cream min-h-[360px]" data-testid="landing-tabs">
        {tab === "overview" && (
          <>
            <div className="bg-navy-deep text-cream px-9 py-9">
              <div className="max-w-[1080px] mx-auto">
                <div className="font-mono text-[11px] tracking-[0.16em] uppercase" style={{ color: ORANGE }}>Why indoor soccer</div>
                <h2 className="font-display font-semibold text-3xl md:text-[34px] leading-tight mt-2 mb-1 max-w-[620px]">Real games, <em className="italic" style={{ color: ORANGE }}>every week</em> — rain, snow, or shine.</h2>
                <p className="text-cream/85 max-w-[560px] text-[15px] mb-6">A faster, higher-scoring game on walled turf, leagues sorted by skill so every match is competitive, and a crew waiting whether or not you bring one.</p>
                <div className="grid md:grid-cols-3 gap-3.5">
                  {WHY_INDOOR.map((v) => (
                    <div key={v.title} className="bg-navy rounded-2xl border border-cream/10 p-4">
                      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-lg mb-2.5", TINT[v.tint])}>{v.icon}</div>
                      <div className="font-display font-semibold text-base mb-0.5">{v.title}</div>
                      <p className="text-[12.5px] text-cream/80 leading-snug">{v.copy}</p>
                    </div>
                  ))}
                </div>
                {current && (
                  <a href={`/adult/leagues/soccer/${current.slug}`} data-testid="overview-season-cta"
                     onClick={() => current && trackLandingCtaClicked({ term: current.slug })}
                     className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-5 rounded-2xl px-6 py-5 mt-6 text-ink" style={{ background: ORANGE }}>
                    <span className="flex items-center gap-4">
                      <span className="font-mono text-[9px] tracking-widest uppercase bg-ink px-2.5 py-1.5 rounded-full whitespace-nowrap" style={{ color: ORANGE }}>● Registration open</span>
                      <span><span className="font-display font-semibold text-2xl leading-none block">{current.label}</span><span className="font-mono text-xs text-ink/70 mt-1 block">{current.dateLine} · {current.divisions} divisions · {current.venues} venues</span></span>
                    </span>
                    <span className="font-mono text-xs tracking-wide uppercase bg-ink text-cream px-4 py-3 rounded-lg whitespace-nowrap">See divisions &amp; register →</span>
                  </a>
                )}
              </div>
            </div>
            <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
              <p className="font-mono text-[11px] tracking-widest uppercase text-ink-muted mb-3">Find your level</p>
              <LevelLadder />
              <p className="font-mono text-[11px] tracking-widest uppercase text-ink-muted mt-9 mb-3">The rules, in brief</p>
              <div className="grid md:grid-cols-2 gap-x-7 gap-y-4">
                {RULE_SECTIONS.map((s) => (<div key={s.title}><h3 className="font-display font-semibold text-lg mb-1">{s.title}</h3><ul className="space-y-1">{s.items.slice(0, 3).map((it) => <li key={it} className="text-[12.5px] text-ink-2 leading-snug">· {it}</li>)}</ul></div>))}
              </div>
            </div></div>
          </>
        )}
        {tab === "this" && (
          <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
            <h2 className="font-display font-semibold text-2xl mb-4">This season</h2>
            {current ? (
              <a href={`/adult/leagues/soccer/${current.slug}`}
                 onClick={() => current && trackLandingCtaClicked({ term: current.slug })}
                 className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-navy-deep text-cream rounded-2xl px-6 py-5">
                <span><span className="font-display font-semibold text-2xl block">{current.label}</span><span className="font-mono text-xs text-cream/80 mt-1 block">{current.dateLine} · {current.divisions} divisions · {current.venues} venues</span></span>
                <span className="font-mono text-xs tracking-wide uppercase rounded-lg px-4 py-3 text-ink whitespace-nowrap" style={{ background: ORANGE }}>See divisions &amp; register →</span>
              </a>
            ) : <p className="text-ink-muted text-sm">No season is open for registration right now — check Upcoming.</p>}
          </div></div>
        )}
        {tab === "upcoming" && (
          <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
            <h2 className="font-display font-semibold text-2xl">Upcoming seasons</h2>
            <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Get on the interest list — we'll email when registration opens.</p>
            {upcoming.length ? upcoming.map((t) => (
              <div key={t.slug} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-paper border border-cream-3 rounded-xl px-5 py-4 mb-2.5">
                <span><span className="font-display font-semibold text-xl block">{t.label}</span><span className="font-mono text-xs text-ink-muted mt-1 block">{t.meta} · {t.opensLabel}</span></span>
                <a href={`/adult/leagues/soccer/${t.slug}`} className="font-mono text-[11px] tracking-wide uppercase border border-primary text-primary px-4 py-2.5 rounded-lg whitespace-nowrap">Notify me →</a>
              </div>
            )) : <div className="text-center py-9 border border-dashed border-cream-3 rounded-xl text-ink-muted text-sm">No upcoming seasons announced yet.</div>}
          </div></div>
        )}
        {tab === "past" && (
          <div className="px-9 py-9"><div className="max-w-[1080px] mx-auto">
            <h2 className="font-display font-semibold text-2xl">Past seasons</h2>
            <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Final standings &amp; results live here once a season wraps.</p>
            {past.length ? past.map((t) => (
              <a key={t.slug} href={`/adult/leagues/soccer/${t.slug}`} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 bg-paper border border-cream-3 rounded-xl px-5 py-4 mb-2.5">
                <span className="font-display font-semibold text-xl">{t.label}</span>
                <span className="font-mono text-[11px] tracking-wide uppercase text-primary">Results →</span>
              </a>
            )) : <div className="text-center py-9 border border-dashed border-cream-3 rounded-xl text-ink-muted text-sm">No completed seasons yet — Fall 2026 is the first. Results &amp; champions will appear here.</div>}
          </div></div>
        )}
      </div>
    </div>
  );
}
