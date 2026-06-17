"use client";
import { SKILL_LEVELS, type SkillLevel } from "@/lib/leagues/adult-soccer-content";
import { cn } from "@/lib/utils";

const TIER_TEXT: Record<SkillLevel["key"], string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
};

function Bars({ filled, className }: { filled: number; className?: string }) {
  const heights = [6, 10, 14, 18];
  return (
    <span className={cn("inline-flex items-end gap-0.5 h-[18px]", className)}>
      {heights.map((h, i) => (
        <i key={i} style={{ height: h }}
           className={cn("w-1 rounded-sm block", i < filled ? "bg-current" : "bg-cream-3")} />
      ))}
    </span>
  );
}

export function LevelLadder({
  selected, onSelect,
}: { selected?: SkillLevel["key"] | null; onSelect?: (k: SkillLevel["key"]) => void }) {
  const interactive = typeof onSelect === "function";
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
      {SKILL_LEVELS.map((lvl) => (
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
            <Bars filled={lvl.bars} />
            <span className="font-display italic text-xl">{lvl.key.toUpperCase()}</span>
            <span className="ml-auto font-mono text-[9px] tracking-widest uppercase">{lvl.label}</span>
          </div>
          <p className="text-[11.5px] leading-snug text-ink-2">{lvl.description}</p>
        </button>
      ))}
    </div>
  );
}

export { Bars };
