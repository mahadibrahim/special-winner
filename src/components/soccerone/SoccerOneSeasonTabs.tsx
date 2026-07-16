"use client";
import { useEffect, useState } from "react";
import SoccerOneLeaguesFinder from "@/components/soccerone/SoccerOneLeaguesFinder";
import SoccerOneStandingsPanel from "@/components/soccerone/SoccerOneStandingsPanel";
import { RULE_SECTIONS, FAQ } from "@/lib/leagues/adult-soccer-content";
import { NIGHT_LABELS, type FinderSeason } from "@/lib/soccerone/leagues-finder";
import { WEEK_ORDER } from "@/lib/leagues/division-filters";
import { formatDaySchedule } from "@/lib/time/format-date";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { trackSeasonViewed } from "@/lib/analytics/events";

type Tab = "divisions" | "schedule" | "standings" | "rules" | "faq";
const TABS: { key: Tab; label: string }[] = [
  { key: "divisions", label: "Divisions" },
  { key: "schedule", label: "Schedule" },
  { key: "standings", label: "Standings" },
  { key: "rules", label: "Rules" },
  { key: "faq", label: "FAQ" },
];

interface SeasonTabSeason extends FinderSeason {
  name: string;
  startTime: string | null;
  endTime: string | null;
}

/**
 * SoccerOne skin of components/leagues/season-tabs — the season tier's five
 * tabs. Content (RULE_SECTIONS, FAQ) and logic (WEEK_ORDER, formatDaySchedule)
 * come from the shared modules so neither can drift from Aspire's; only the
 * shell is brand-specific.
 *
 * NOTE (Phase A handoff): the FAQ tab renders the shared FAQ constants
 * inline, the same way Aspire's season-tabs does today. When Phase A lands
 * faq-block.astro + faqPageJsonLd, migrate BOTH brands' FAQ tabs onto it —
 * building it here first would collide with that in-flight branch.
 */
export default function SoccerOneSeasonTabs({ seasons, weekStart, term }: {
  seasons: SeasonTabSeason[];
  weekStart: string;
  term: string;
}) {
  useHydrationBeacon();
  const [tab, setTab] = useState<Tab>("divisions");
  useEffect(() => {
    trackSeasonViewed({ sport: "soccer", term });
  }, [term]);

  return (
    <div className="so-stabs-root" id="divisions">
      <style>{`
        .so-stabs-root { max-width: 1400px; margin: 0 auto; padding: 0 2rem 4rem; }
        .so-stabs { display: flex; gap: 2px; flex-wrap: wrap; border-bottom: 1px solid var(--so-lime-a20); }
        .so-stab { font-family: var(--so-font-mono); font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; padding: 0.65rem 1rem; color: rgba(255,255,255,0.4); background: none; border: none; cursor: pointer; position: relative; top: 1px; }
        .so-stab:hover { color: rgba(255,255,255,0.7); }
        .so-stab.on { background: var(--so-lime); color: var(--so-ink); font-weight: 700; border-radius: var(--so-radius-sm) var(--so-radius-sm) 0 0; }
        .so-stab-pane { padding-top: 1.5rem; }
        .so-stab-h { font-family: var(--so-font-display); font-size: 1.5rem; color: #fff; text-transform: uppercase; letter-spacing: 0.01em; margin-bottom: 0.25rem; }
        .so-stab-sub { color: rgba(255,255,255,0.45); font-size: 0.875rem; margin-bottom: 1.25rem; max-width: 60ch; }
        .so-rules-note { border: 1px solid var(--so-lime-a25); background: var(--so-lime-a06); border-radius: var(--so-radius-md); padding: 0.75rem 1rem; font-size: 0.8125rem; color: rgba(255,255,255,0.65); margin-bottom: 1.25rem; }
        .so-rules-note b { color: var(--so-lime); }
        .so-rules-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem 2rem; }
        @media (max-width: 760px) { .so-rules-grid { grid-template-columns: 1fr; } }
        .so-rules-h { font-family: var(--so-font-mono); font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--so-lime); padding-bottom: 0.4rem; border-bottom: 1px solid var(--so-lime-a20); margin-bottom: 0.6rem; }
        .so-rules-li { font-size: 0.8125rem; color: rgba(255,255,255,0.6); line-height: 1.5; padding-left: 1rem; position: relative; margin-bottom: 0.35rem; }
        .so-rules-li::before { content: '›'; position: absolute; left: 0; color: var(--so-lime); font-weight: 700; }
        .so-faq-a { font-size: 0.8125rem; color: rgba(255,255,255,0.6); line-height: 1.55; }
        .so-sched-wrap { overflow-x: auto; }
        table.so-sched { width: 100%; min-width: 420px; border-collapse: collapse; font-size: 0.8125rem; }
        .so-sched th { text-align: left; font-family: var(--so-font-mono); font-size: 0.55rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--so-lime-a50); padding: 0.5rem; border-bottom: 1px solid var(--so-lime-a20); }
        .so-sched td { padding: 0.6rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.6); }
        .so-sched td.d { color: #fff; font-weight: 700; text-transform: uppercase; font-family: var(--so-font-mono); font-size: 0.7rem; white-space: nowrap; }
      `}</style>

      <div className="so-stabs" role="tablist" aria-label="Season">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`so-stab ${tab === t.key ? "on" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "divisions" && (
        <div className="so-stab-pane">
          <h2 className="so-stab-h">Find your division &amp; register</h2>
          <p className="so-stab-sub">Pick your level, then narrow by format, night, or location. Open divisions register on the spot.</p>
          <SoccerOneLeaguesFinder seasons={seasons} />
        </div>
      )}

      {tab === "schedule" && (
        <div className="so-stab-pane">
          <h2 className="so-stab-h">When games run</h2>
          <p className="so-stab-sub">One game per week per team, 6–11pm depending on the night. Exact slots are assigned after rosters lock.</p>
          <ScheduleTable seasons={seasons} />
        </div>
      )}

      {tab === "standings" && (
        <div className="so-stab-pane">
          <h2 className="so-stab-h">Standings &amp; results</h2>
          <p className="so-stab-sub">Live league table, updated as scores come in. Pick a division.</p>
          <SoccerOneStandingsPanel
            divisions={seasons.map((s) => ({ seasonId: s.id, name: s.name }))}
            weekStart={weekStart}
            term={term}
          />
        </div>
      )}

      {tab === "rules" && (
        <div className="so-stab-pane">
          <h2 className="so-stab-h">Rules &amp; regulations</h2>
          <div className="so-rules-note">
            <b>Walled-arena 7v7.</b> All fields have boards — no offside, the wall is in play.
          </div>
          <div className="so-rules-grid">
            {RULE_SECTIONS.map((s) => (
              <div key={s.title}>
                <h3 className="so-rules-h">{s.title}</h3>
                <ul>
                  {s.items.map((it) => <li key={it} className="so-rules-li">{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "faq" && (
        <div className="so-stab-pane">
          <h2 className="so-stab-h">Common questions</h2>
          <div className="so-rules-grid">
            {FAQ.map((e) => (
              <div key={e.q}>
                <h3 className="so-rules-h">{e.q}</h3>
                <p className="so-faq-a">{e.a}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ScheduleTable({ seasons }: { seasons: SeasonTabSeason[] }) {
  // Dated day groups only — day-TBD divisions are omitted here (they still
  // show in the Divisions tab under "Day TBD").
  const rows = WEEK_ORDER
    .map((day) => ({
      day,
      label: NIGHT_LABELS[day],
      items: seasons.filter((s) => s.dayOfWeek === day),
    }))
    .filter((r) => r.items.length > 0);

  if (rows.length === 0) {
    return <p className="so-stab-sub">Schedule posts once divisions are set.</p>;
  }

  return (
    <div className="so-sched-wrap">
      <table className="so-sched">
        <thead><tr><th>Night</th><th>Divisions</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <td className="d">{r.label}</td>
              <td>
                {r.items.map((s) => {
                  const sched = formatDaySchedule(s.dayOfWeek, s.startTime, s.endTime);
                  // formatDaySchedule → "Mondays · 6–11pm"; keep just the time
                  // part next to the name (the row already names the night).
                  const time = sched.includes("·") ? sched.split("·")[1].trim() : null;
                  return `${s.name}${time ? ` (${time})` : ""}`;
                }).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
