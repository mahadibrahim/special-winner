"use client";
import { tierColorClass, priceLabel, formatDayTime, type RailMode } from "@/lib/leagues/rail-content";
import { formatDateOnly } from "@/lib/time/format-date";

export interface RailSeason {
  name: string;
  skillLevel: string | null;
  divisionGender: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  startDate: string | null;
  location: { name: string };
  price: number;
  teamPrice: number | null;
  deposit: number | null;
  sport: { color: string | null };
  earlyBirdDeadline: string | null;
  /** Server-computed by the season detail endpoint; true only while the early-bird window is live. */
  earlyBirdActive?: boolean;
  /** Early-bird-aware price in dollars (detail endpoint), preferred by priceLabel for solo/share. */
  effectivePrice?: number | null;
}

interface Props {
  season: RailSeason;
  mode: RailMode;
  step: number;
  stepCount: number;
  variant?: "active" | "success";
  children: React.ReactNode;
}

const fmtDate = (iso: string | null) =>
  iso ? formatDateOnly(iso, { month: "short", day: "numeric" }) : null;

export default function LeagueContextRail({ season, mode, step, stepCount, variant = "active", children }: Props) {
  const tier = (season.skillLevel ?? "").toUpperCase();
  const { amount, unit } = priceLabel(mode, season);
  const dayTime = formatDayTime(season.dayOfWeek, season.startTime, season.endTime);
  const success = variant === "success";
  const railBg = success ? "bg-sage text-ink" : "bg-ink text-cream";

  const Facts = (
    <>
      {dayTime && <div className="text-xs opacity-80">{dayTime}</div>}
      <div className="text-xs opacity-80">
        {season.location.name.replace(/^Soccer One\s+/i, "")}
        {fmtDate(season.startDate) ? ` · Starts ${fmtDate(season.startDate)}` : ""}
      </div>
    </>
  );

  const Progress = (
    <div className="flex gap-1 mt-4" aria-hidden>
      {Array.from({ length: stepCount }).map((_, i) => (
        <span key={i} className={`h-1 flex-1 rounded ${i < step ? (success ? "bg-ink" : "bg-primary") : "bg-cream/20"}`} />
      ))}
    </div>
  );

  return (
    <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 max-w-5xl mx-auto">
      {/* Desktop rail */}
      <aside className={`hidden lg:block self-start sticky top-24 rounded-2xl p-6 ${railBg}`}>
        {tier && (
          <span className={`inline-block rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider bg-cream ${tierColorClass(season.skillLevel)}`}>
            Tier {tier}{success ? " · Registered" : ""}
          </span>
        )}
        <h2 className="font-display text-2xl mt-3 mb-1">{season.name}</h2>
        {Facts}
        {!success && (
          <>
            <div className="border-t border-cream/20 my-4" />
            <div className="font-display text-2xl font-bold">
              {amount}<span className="text-xs font-sans font-normal opacity-70"> {unit}</span>
            </div>
            {season.earlyBirdDeadline && (season.earlyBirdActive ?? true) && (
              <div className="text-xs text-primary-orange-bright mt-1">Early-bird ends {fmtDate(season.earlyBirdDeadline)}</div>
            )}
          </>
        )}
        {Progress}
      </aside>

      {/* Mobile pinned strip */}
      <div className={`lg:hidden sticky top-16 z-10 -mx-4 px-4 py-3 ${railBg}`}>
        <div className="flex items-center gap-2">
          {tier && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-cream ${tierColorClass(season.skillLevel)}`}>{tier}</span>
          )}
          <span className="font-display text-lg">{season.name}</span>
          {!success && <span className="ml-auto font-display font-bold">{amount}</span>}
        </div>
        <div className="flex gap-1 mt-2" aria-hidden>
          {Array.from({ length: stepCount }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded ${i < step ? (success ? "bg-ink" : "bg-primary") : "bg-cream/20"}`} />
          ))}
        </div>
      </div>

      <section className="pt-6 lg:pt-0">{children}</section>
    </div>
  );
}
