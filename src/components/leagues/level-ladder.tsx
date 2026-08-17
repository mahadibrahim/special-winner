"use client";
import { SKILL_LEVELS, type SkillLevel } from "@/lib/leagues/adult-soccer-content";
import { YOUTH_SKILL_LEVELS } from "@/lib/leagues/youth-soccer-content";
import { cn } from "@/lib/utils";

const TIER_TEXT: Record<string, string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
  // Youth: the competitive pair shares the two strongest hues, the two tracks
  // get their own. Deliberately not a gradient — see youth-soccer-content.ts.
  competitive_a: "text-ink", competitive_b: "text-primary",
  developmental: "text-ochre", recreational: "text-sage",
};

function Bars({ filled, flat = false, className }: { filled: number; flat?: boolean; className?: string }) {
  // flat: four equal bars — "all levels welcome", not a strength rating.
  // Open divisions were rendering the ascending 4/4 ladder, which reads as
  // elite (same mark as Level A) instead of open-to-everyone.
  const heights = flat ? [11, 11, 11, 11] : [6, 10, 14, 18];
  return (
    <span className={cn("inline-flex items-end gap-0.5 h-[18px]", className)}>
      {heights.map((h, i) => (
        <i key={i} style={{ height: h }}
           className={cn("w-1 rounded-sm block", i < filled ? "bg-current" : "bg-cream-3")} />
      ))}
    </span>
  );
}

interface LadderItem {
  key: string;
  label: string;
  description: string;
  /** Adult tiers carry an ascending bar count; youth tracks do not. */
  bars?: number;
}

/**
 * Level chooser. Two shapes, one component:
 *
 * - `audience="adult"` (default): a RANKED ladder. Big display letter, ascending
 *   bars — you are picking where you sit against other adults.
 * - `audience="youth"`: TRACKS. No letter, flat bars, label leads. Competitive A
 *   and B are a pair and Developmental / Recreational are alternatives, not
 *   lower rungs, so nothing here should read as a 1-of-4 rating of a kid.
 *
 * Adult callers that pass nothing are unchanged.
 */
export function LevelLadder({
  selected, onSelect, audience = "adult",
}: {
  selected?: string | null;
  onSelect?: (k: string) => void;
  audience?: "adult" | "youth";
}) {
  const interactive = typeof onSelect === "function";
  const isYouth = audience === "youth";
  const items: LadderItem[] = isYouth ? YOUTH_SKILL_LEVELS : SKILL_LEVELS;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {items.map((lvl) => (
        <button
          key={lvl.key}
          type="button"
          aria-pressed={interactive ? selected === lvl.key : undefined}
          onClick={interactive ? () => onSelect!(lvl.key) : undefined}
          className={cn(
            "text-left bg-paper border border-cream-3 rounded-xl p-3 transition",
            TIER_TEXT[lvl.key],
            interactive && "cursor-pointer hover:border-ink-muted",
            interactive && selected === lvl.key && "border-ink shadow-[inset_0_0_0_2px] shadow-ink",
          )}
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Bars filled={isYouth ? 4 : (lvl.bars ?? 4)} flat={isYouth} />
            {isYouth ? (
              <span className="font-display text-[15px] leading-tight">{lvl.label}</span>
            ) : (
              <>
                <span className="font-display italic text-xl">{lvl.key.toUpperCase()}</span>
                <span className="ml-auto font-mono text-[9px] tracking-widest uppercase">{lvl.label}</span>
              </>
            )}
          </div>
          <p className="text-[11.5px] leading-snug text-ink-2">{lvl.description}</p>
        </button>
      ))}
    </div>
  );
}

export { Bars };
export type { SkillLevel };
