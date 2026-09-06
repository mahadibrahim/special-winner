// Pure helpers for the league-context rail. No React, no DOM — unit-testable.
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";

export type RailMode = "solo" | "team" | "share";

// Youth tiers reuse the adult ramp so the rail reads consistently across both
// audiences: most competitive → ink, down to sage.
const TIER_TEXT: Record<string, string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
  competitive_a: "text-ink", competitive_b: "text-primary",
  developmental: "text-ochre", recreational: "text-sage",
};

export function tierColorClass(skillLevel: string | null | undefined): string {
  return TIER_TEXT[(skillLevel ?? "").toLowerCase()] ?? "text-ink";
}

function usd(n: number): string {
  // Whole dollars stay terse ("$120"); fractional amounts keep both cent
  // digits ("$90.50", never "$90.5") — odd-cent team-share splits hit this.
  return (
    "$" +
    n.toLocaleString("en-US", {
      minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/**
 * The one canonical team-price story: a flat $200 deposit reserves the team
 * today; the roster splits the (early-bird-aware) total. Every surface that
 * mentions team pricing renders from this so the framing can't drift.
 */
export function teamPriceStory(season: {
  price: number;
  teamPrice: number | null;
  effectiveTeamPrice?: number | null;
  teamEarlyBirdActive?: boolean;
}): { deposit: string; total: string; baseTotal: string | null } {
  const list = season.teamPrice ?? season.price;
  const eff = season.effectiveTeamPrice ?? list;
  const discountLive = season.teamEarlyBirdActive === true && eff < list;
  return {
    deposit: usd(CAPTAIN_DEPOSIT_DOLLARS),
    total: usd(eff),
    baseTotal: discountLive ? usd(list) : null,
  };
}

/**
 * Price-led team breakdown for the context rail. The team total leads (with
 * the struck base price while early-bird is live); the $200 deposit and the
 * roster's split are shown as a plain two-line breakdown beneath it. This is
 * the rail-side counterpart to teamPriceStory — same source numbers, shaped
 * for the sidebar card rather than a one-line label.
 *
 * When a discount has been applied to the team, pass discountCents: the total
 * and roster split reflect it, and baseTotal shows the pre-discount team fee.
 *
 * `isYouth` (winter-team-fixes, fix round 2 — micro round) selects the
 * roster-split math: youth rosters cover the FULL effective total (the $200
 * deposit is a refundable hold, never a per-share credit — see
 * captain-credit.ts); adult rosters cover the total minus the deposit,
 * unchanged. This is a plain boolean, not a re-derivation of the predicate —
 * the caller resolves youth-ness once via the canonical `isYouthTeamSeason`
 * (team-season-kind.ts) and passes the result in, so this pure-math module
 * never needs its own copy of that logic.
 */
export function teamRailBreakdown(
  season: {
    price: number;
    teamPrice: number | null;
    effectiveTeamPrice?: number | null;
    teamEarlyBirdActive?: boolean;
  },
  opts?: { discountCents?: number | null; isYouth?: boolean },
): { total: string; baseTotal: string | null; depositToday: string; rosterPays: string } {
  const list = season.teamPrice ?? season.price;
  const earlyBird = season.effectiveTeamPrice ?? list;
  const discount = (opts?.discountCents ?? 0) / 100;
  const effective = Math.max(0, earlyBird - discount);
  // baseTotal (the struck-through number) is whichever higher figure the
  // effective price is a discount from: the list price when an early-bird
  // window is live, or the early-bird price when a code has been applied.
  const discountLive = discount > 0;
  const earlyBirdLive = season.teamEarlyBirdActive === true && earlyBird < list;
  const base = discountLive ? earlyBird : earlyBirdLive ? list : null;
  const rosterPays = opts?.isYouth
    ? effective
    : Math.max(0, effective - CAPTAIN_DEPOSIT_DOLLARS);
  return {
    total: usd(effective),
    baseTotal: base != null && base > effective ? usd(base) : null,
    depositToday: usd(CAPTAIN_DEPOSIT_DOLLARS),
    rosterPays: usd(rosterPays),
  };
}

export function priceLabel(
  mode: RailMode,
  season: {
    price: number;
    teamPrice: number | null;
    deposit: number | null;
    /** Early-bird-aware price served by the season detail endpoint. */
    effectivePrice?: number | null;
    /** Early-bird-aware TEAM price + whether the team window is live. */
    effectiveTeamPrice?: number | null;
    teamEarlyBirdActive?: boolean;
  },
  opts?: { shareCents?: number | null },
): { amount: string; unit: string } {
  if (mode === "team") {
    // Deposit-first: the amount a captain pays TODAY leads; the total is
    // context. teamPriceStory is early-bird-aware and only marks a discount
    // when the window is genuinely live.
    const story = teamPriceStory(season);
    return {
      amount: `${story.deposit} down`,
      unit: story.baseTotal
        ? `today · ${story.total} total (early-bird) · your roster pays the rest`
        : `today · ${story.total} total · your roster pays the rest`,
    };
  }
  if (mode === "share") {
    // An invite-link visitor's rail must show the amount the captain actually
    // assigned them — never the solo price (they may owe more or less). With
    // no assigned share known yet, render nothing; the rail itself renders
    // the fallback sentence instead of guessing.
    if (opts?.shareCents == null) return { amount: "", unit: "" };
    return { amount: usd(opts.shareCents / 100), unit: "your share" };
  }
  // Solo displays the per-player price the charge path would use right
  // now — the early-bird price while active. Falls back to the list price for
  // callers that don't carry effectivePrice.
  const soloPrice = usd(season.effectivePrice ?? season.price);
  return { amount: soloPrice, unit: "solo" };
}

// dayOfWeek is stored lowercase 3-char ('mon'..'sun'); normalize to a label.
const DAY_LABEL: Record<string, string> = {
  sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
};

function to12h(t: string): string {
  const parts = t.split(":").map(Number);
  const h = parts[0];
  const m = parts[1];
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  // Only include minutes if non-zero
  return m > 0 ? `${h12}:${String(m).padStart(2, "0")}${ampm}` : `${h12}${ampm}`;
}

export function formatDayTime(day: string | null, start: string | null, end: string | null): string {
  const label = DAY_LABEL[(day ?? "").toLowerCase()];
  if (!label) return "";

  // No start time at all → just the day label.
  if (!start) return label;

  // Determine daypart from start hour
  const [h] = start.split(":").map(Number);
  let daypart: string;
  if (h < 12) {
    daypart = "mornings";
  } else if (h < 17) {
    daypart = "afternoons";
  } else {
    daypart = "nights";
  }

  const d = `${label} ${daypart}`;
  // Start but no end → the day+daypart label, no time range to render.
  if (!end) return d;

  // "7–10pm" — collapse matching periods to one suffix.
  const s = to12h(start), e = to12h(end);
  const sNum = s.replace(/[ap]m/, ""), sPer = s.slice(-2), ePer = e.slice(-2);
  return sPer === ePer ? `${d} · ${sNum}–${e}` : `${d} · ${s}–${e}`;
}
