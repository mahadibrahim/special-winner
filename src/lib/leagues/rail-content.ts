// Pure helpers for the league-context rail. No React, no DOM — unit-testable.
type Tier = "a" | "b" | "c" | "d";
export type RailMode = "solo" | "team" | "share";

const TIER_TEXT: Record<Tier, string> = {
  a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage",
};

export function tierColorClass(skillLevel: string | null | undefined): string {
  const k = (skillLevel ?? "").toLowerCase() as Tier;
  return TIER_TEXT[k] ?? "text-ink";
}

function usd(n: number): string {
  return "$" + n.toLocaleString("en-US");
}

export function priceLabel(
  mode: RailMode,
  season: {
    price: number;
    teamPrice: number | null;
    deposit: number | null;
    /** Early-bird-aware price served by the season detail endpoint. */
    effectivePrice?: number | null;
  },
): { amount: string; unit: string } {
  if (mode === "team") return { amount: usd(season.teamPrice ?? season.price), unit: "team · early-bird" };
  // Solo/share display the per-player price the charge path would use right
  // now — the early-bird price while active. Falls back to the list price for
  // callers that don't carry effectivePrice.
  const soloPrice = usd(season.effectivePrice ?? season.price);
  if (mode === "share") return { amount: soloPrice, unit: "your share" };
  return { amount: soloPrice, unit: "solo" };
}

// dayOfWeek is stored lowercase 3-char ('mon'..'sun'); normalize to a label.
const DAY_LABEL: Record<string, string> = {
  sun: "Sun", mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat",
};

function to12h(t: string): string {
  const [h] = t.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${ampm}`;
}

export function formatDayTime(day: string | null, start: string | null, end: string | null): string {
  const label = DAY_LABEL[(day ?? "").toLowerCase()];
  if (!label) return "";
  const d = `${label} nights`;
  if (!start || !end) return d;
  // "7–10pm" — collapse matching periods to one suffix.
  const s = to12h(start), e = to12h(end);
  const sNum = s.replace(/[ap]m/, ""), sPer = s.slice(-2), ePer = e.slice(-2);
  return sPer === ePer ? `${d} · ${sNum}–${e}` : `${d} · ${s}–${e}`;
}
