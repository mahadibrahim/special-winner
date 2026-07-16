"use client";
import { SKILL_LEVELS } from "@/lib/leagues/adult-soccer-content";

/**
 * Interactive level ladder — SoccerOne skin of components/leagues/level-ladder.
 * The card you read IS the control you press: clicking A/B/C/D drives the
 * finder's level filter. This replaces both the static SoccerOneLeagueLevels
 * display and the flat "Level" chip row, which used to ask the same question
 * twice in two visual languages.
 *
 * Copy comes from the shared SKILL_LEVELS constants so tier descriptions can
 * never drift between brands. Styles are embedded (Astro scoped styles don't
 * reach React islands) and reference only --so-* tokens.
 */
export default function SoccerOneLevelLadder({ selected, onSelect }: {
  selected: string;
  onSelect: (level: string) => void;
}) {
  return (
    <div className="so-lad" role="group" aria-label="Find your level — click to filter">
      <style>{`
        .so-lad { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.6rem; }
        @media (max-width: 900px) { .so-lad { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 520px) { .so-lad { grid-template-columns: 1fr; } }
        .so-lad-c {
          background: var(--so-surface); border: 1px solid var(--so-lime-a15);
          border-radius: var(--so-radius-md); padding: 1rem; text-align: left;
          display: flex; flex-direction: column; gap: 0.5rem; cursor: pointer;
          transition: border-color 0.15s, background 0.15s; font: inherit; color: inherit;
        }
        .so-lad-c:hover { border-color: var(--so-lime-a40); }
        .so-lad-c.on { border-color: var(--so-lime); background: var(--so-lime-a08); box-shadow: inset 0 0 0 1px var(--so-lime-a30); }
        .so-lad-bars { display: flex; gap: 4px; }
        .so-lad-bar { width: 22px; height: 6px; border-radius: 2px; background: var(--so-lime-a15); }
        .so-lad-bar.f { background: var(--so-lime); }
        .so-lad-k { font-family: var(--so-font-display); font-size: 2.2rem; color: #fff; line-height: 1; letter-spacing: 0.01em; }
        .so-lad-t { font-family: var(--so-font-mono); font-size: 0.55rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--so-lime); }
        .so-lad-d { color: rgba(255,255,255,0.55); font-size: 0.78rem; line-height: 1.5; }
      `}</style>
      {SKILL_LEVELS.map((lv) => (
        <button
          key={lv.key}
          type="button"
          aria-pressed={selected === lv.key}
          className={`so-lad-c ${selected === lv.key ? "on" : ""}`}
          onClick={() => onSelect(lv.key)}
        >
          <span className="so-lad-bars">
            {[1, 2, 3, 4].map((n) => (
              <span key={n} className={`so-lad-bar ${n <= lv.bars ? "f" : ""}`} />
            ))}
          </span>
          <span className="so-lad-k">{lv.key.toUpperCase()}</span>
          <span className="so-lad-t">{lv.label}</span>
          <span className="so-lad-d">{lv.description}</span>
        </button>
      ))}
    </div>
  );
}
