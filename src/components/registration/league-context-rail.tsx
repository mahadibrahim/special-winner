"use client";
import { tierColorClass, priceLabel, teamRailBreakdown, formatDayTime, type RailMode } from "@/lib/leagues/rail-content";
import { railTierBadge } from "@/lib/leagues/division-filters";
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
  /** Early-bird-aware TEAM price + whether the team early-bird window is live. */
  effectiveTeamPrice?: number | null;
  teamEarlyBirdActive?: boolean;
}

/** One wizard step for the rail's progress bar. Optional steps render dashed
 *  and are excluded from the "required" run. */
export interface RailStep {
  label: string;
  optional?: boolean;
}

interface Props {
  season: RailSeason;
  mode: RailMode;
  /** 1-based index of the current step. */
  step: number;
  /** Fallback segment count when `steps` isn't provided (all treated required). */
  stepCount: number;
  /** Named steps → labeled required/optional progress. Length wins over stepCount. */
  steps?: RailStep[];
  /** Team mode only: cents of an applied team discount, so the rail's total
   *  and roster split reflect it. */
  discountCents?: number | null;
  variant?: "active" | "success";
  /** The captain-assigned share for an invite-link visitor (share mode only).
   *  null/undefined → the exact amount isn't known yet; the rail renders the
   *  fallback sentence instead of ever guessing the solo price. */
  shareCents?: number | null;
  children: React.ReactNode;
}

const fmtDate = (iso: string | null) =>
  iso ? formatDateOnly(iso, { month: "short", day: "numeric" }) : null;

const NO_SHARE_FALLBACK =
  "Your captain set your share — you'll see the exact amount before payment.";

export default function LeagueContextRail({ season, mode, step, stepCount, steps, discountCents, variant = "active", shareCents, children }: Props) {
  // Adult renders "TIER B" (desktop) / "B" (mobile) — byte-identical to the
  // pre-vocabulary rail, which combined a plain string with a shared CSS
  // `uppercase` class. Youth renders the plain label ("Developmental") at
  // both breakpoints. See railTierBadge's doc comment for why the casing now
  // lives in the string instead of CSS.
  const tier = railTierBadge(season.skillLevel);
  const isTeam = mode === "team";
  const { amount, unit } = priceLabel(mode, season, { shareCents });
  const teamBreak = isTeam ? teamRailBreakdown(season, { discountCents }) : null;
  const noShareYet = mode === "share" && !amount;
  const dayTime = formatDayTime(season.dayOfWeek, season.startTime, season.endTime);
  const success = variant === "success";
  const railBg = success ? "bg-sage text-ink" : "bg-ink text-cream";

  // Team early-bird deadline shows for team mode; solo/share use the per-player
  // window. The team line is suppressed once a discount is applied (baseTotal
  // already tells the savings story).
  const showTeamEbLine = isTeam && season.teamEarlyBirdActive === true && !discountCents && !!season.earlyBirdDeadline;
  const showSoloEbLine = !isTeam && !!season.earlyBirdDeadline && (season.earlyBirdActive ?? true);

  const Facts = (
    <>
      {dayTime && <div className="text-xs opacity-80">{dayTime}</div>}
      <div className="text-xs opacity-80">
        {season.location.name.replace(/^Soccer One\s+/i, "")}
        {fmtDate(season.startDate) ? ` · Starts ${fmtDate(season.startDate)}` : ""}
      </div>
    </>
  );

  // ── Progress ──────────────────────────────────────────────────────────────
  // Named steps render a labeled required/optional bar; without them we fall
  // back to a plain N-segment bar (all required) for backward compatibility.
  const stepList: RailStep[] = steps ?? Array.from({ length: stepCount }, () => ({ label: "" }));
  const total = stepList.length;
  const optionalCount = stepList.filter((s) => s.optional).length;
  const current = stepList[step - 1];

  const segClass = (i: number) => {
    const n = i + 1;
    if (n < step) return success ? "bg-ink" : "bg-sage"; // done
    if (n === step) return success ? "bg-ink" : "bg-primary"; // current
    if (stepList[i]?.optional) return "border border-dashed border-cream/40"; // optional-upcoming
    return "bg-cream/30"; // required-upcoming
  };

  const Progress = (
    <div className="mt-4">
      <div className="flex gap-1" aria-hidden>
        {stepList.map((_, i) => (
          <span key={i} className={`h-1 flex-1 rounded ${segClass(i)}`} />
        ))}
      </div>
      {steps && (
        <div className="flex justify-between gap-2 mt-2 font-mono text-[9px] tracking-wide uppercase opacity-80">
          <span>
            Step {step} of {total}
            {current?.label ? ` · ${current.label}` : ""}
            {current ? ` · ${current.optional ? "optional" : "required"}` : ""}
          </span>
          {optionalCount > 0 && <span className="whitespace-nowrap">{optionalCount} optional →</span>}
        </div>
      )}
    </div>
  );

  const TeamPrice = teamBreak && (
    <>
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-bold leading-none">{teamBreak.total}</span>
        {teamBreak.baseTotal && <span className="text-sm opacity-55 line-through">{teamBreak.baseTotal}</span>}
      </div>
      <div className="text-xs opacity-75 mt-0.5">
        per team{season.teamEarlyBirdActive && !discountCents ? " · early-bird" : ""}
      </div>
      <div className="mt-3 flex flex-col gap-1.5 text-[13px]">
        <div className="flex justify-between">
          <span className="opacity-80">Due today (deposit)</span>
          <span className="font-semibold tabular-nums text-ochre">{teamBreak.depositToday}</span>
        </div>
        <div className="flex justify-between">
          <span className="opacity-80">Your roster pays</span>
          <span className="font-semibold tabular-nums">{teamBreak.rosterPays}</span>
        </div>
      </div>
    </>
  );

  // Mobile strip amount: team shows the total; solo/share keep priceLabel.
  const stripAmount = isTeam ? teamBreak?.total : amount;

  return (
    <div className="lg:grid lg:grid-cols-[320px_1fr] lg:gap-8 max-w-5xl mx-auto">
      {/* Desktop rail */}
      <aside className={`hidden lg:block self-start sticky top-24 rounded-2xl p-6 ${railBg}`}>
        {tier.desktop && (
          <span className={`inline-block rounded px-2 py-1 text-[10px] font-bold tracking-wider bg-cream ${tierColorClass(season.skillLevel)}`}>
            {/* Suffix casing tracks the badge: adult badges are ALL CAPS (the
                pre-vocabulary CSS `uppercase` covered this suffix too), youth
                badges are plain words and stay that way. See issue #561. */}
            {tier.desktop}{success ? (tier.isAdult ? " · REGISTERED" : " · Registered") : ""}
          </span>
        )}
        <h2 className="font-display text-2xl mt-3 mb-1">{season.name}</h2>
        {Facts}
        {!success && (
          <>
            <div className="border-t border-cream/20 my-4" />
            {isTeam ? (
              TeamPrice
            ) : noShareYet ? (
              <div className="text-xs opacity-80">{NO_SHARE_FALLBACK}</div>
            ) : (
              <div className="font-display text-2xl font-bold">
                {amount}<span className="text-xs font-sans font-normal opacity-70"> {unit}</span>
              </div>
            )}
            {(showTeamEbLine || showSoloEbLine) && (
              <div className="text-xs text-primary-orange-bright mt-1">Early-bird ends {fmtDate(season.earlyBirdDeadline)}</div>
            )}
          </>
        )}
        {Progress}
      </aside>

      {/* Mobile pinned strip */}
      <div className={`lg:hidden sticky top-16 z-10 -mx-4 px-4 py-3 ${railBg}`}>
        <div className="flex items-center gap-2">
          {tier.mobile && (
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold tracking-wider bg-cream ${tierColorClass(season.skillLevel)}`}>{tier.mobile}</span>
          )}
          <span className="font-display text-lg">{season.name}</span>
          {!success && noShareYet && (
            <span className="ml-auto text-[11px] opacity-80 text-right max-w-[55%]">{NO_SHARE_FALLBACK}</span>
          )}
          {!success && !noShareYet && stripAmount && (
            <span className="ml-auto text-right leading-tight">
              <span className="font-display font-bold">{stripAmount}</span>
              {isTeam && <span className="block text-[9px] font-mono uppercase tracking-wide opacity-70">per team{season.teamEarlyBirdActive && !discountCents ? " · early-bird" : ""}</span>}
            </span>
          )}
        </div>
        {/* Most registrants arrive on mobile straight from a catalog card — the
            facts line confirms what they picked (night, venue, start) without
            scrolling back. */}
        <div className="text-[11px] opacity-80 mt-1">
          {[
            dayTime,
            season.location.name.replace(/^Soccer One\s+/i, ""),
            fmtDate(season.startDate) ? `Starts ${fmtDate(season.startDate)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
        <div className="flex gap-1 mt-2" aria-hidden>
          {stepList.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded ${segClass(i)}`} />
          ))}
        </div>
        {steps && (
          <div className="flex justify-between gap-2 mt-1.5 font-mono text-[8.5px] tracking-wide uppercase opacity-80">
            <span>
              Step {step} of {total}
              {current?.label ? ` · ${current.label}` : ""}
            </span>
            {optionalCount > 0 && <span className="whitespace-nowrap">{optionalCount} optional →</span>}
          </div>
        )}
      </div>

      <section className="pt-6 lg:pt-0">{children}</section>
    </div>
  );
}
