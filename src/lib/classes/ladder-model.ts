/**
 * Pure view-model for the four-rung class purchase ladder rendered by
 * `src/components/youth/class-purchase-ladder.tsx` on /youth/classes.
 *
 * There are four ways into a class, cheapest-commitment first:
 *
 *   1. Drop-in   — one session, "just show up once". Priced off the slot
 *                  template's own `sessionRateCents` (NEVER the org's
 *                  drop_in_rate_card, which is adult pickup pricing — see
 *                  src/lib/classes/class-rate.ts).
 *   2. Packs     — N floating credits, `/api/public/class-packs`.
 *   3. Block     — the current-or-next fixed term, `/api/public/class-blocks`.
 *   4. Membership— monthly allotment tiers, `/api/public/membership-tiers`.
 *
 * Everything here is a pure function of the four already-fetched payloads so
 * it can be unit-tested without a browser or a DB (tests/unit/classes/
 * ladder-model.test.ts). The component owns fetching, auth probes and
 * checkout; this module owns "what is sellable, in what order, at what
 * price".
 *
 * FAIL-SOFT is the governing rule: a rung whose data is empty (or whose
 * fetch failed, which the caller passes in as empty) simply does not appear.
 * When packs, block and tiers are ALL empty the caller renders the
 * figure-free `PRICING_CARDS_FALLBACK` explainer instead of inventing
 * numbers — signalled by `showFallback`.
 */

// ---------------------------------------------------------------------------
// Wire shapes — these mirror the public endpoints exactly, so the component
// can hand raw response bodies straight in.
// ---------------------------------------------------------------------------

/** One row of `GET /api/public/class-packs` → `packs[]`. */
export interface LadderPack {
  id: string;
  name: string;
  sessionCount: number;
  priceCents: number;
  expiryMonths: number | null;
}

/** One row of `GET /api/public/class-blocks` → `block.templates[]`. */
export interface BlockTemplate {
  slotTemplateId: string;
  name: string;
  weekday: number;
  startTime: string;
  venueName: string | null;
  spotsLeft: number;
  totalSessions: number;
  remainingSessions: number;
  fullPriceCents: number;
  proratedPriceCents: number;
}

/** `GET /api/public/class-blocks` → `block` (null between terms). */
export interface BlockWindow {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  upcoming: boolean;
  templates: BlockTemplate[];
}

export interface LadderTierBenefits {
  classes_per_month?: number;
  unlimited_classes?: boolean;
  camp_discount_pct?: number;
  [key: string]: unknown;
}

/** One row of `GET /api/public/membership-tiers` → `tiers[]`. */
export interface LadderTier {
  id: string;
  name: string;
  tagline: string | null;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  annualFeeCents: number | null;
  benefits: LadderTierBenefits;
  displayOrder: number;
  /** Monthly supplement for technical-band classes under this tier, cents.
   *  Null/undefined = no technical supplement configured — never render a
   *  $0 line for that case. */
  technicalMonthlyCents?: number | null;
}

/** The only field of `GET /api/public/class-schedule` → `slots[]` the ladder
 *  needs. Structurally typed so the component can pass its fuller row. */
export interface LadderScheduleSlot {
  sessionRateCents: number | null;
}

// ---------------------------------------------------------------------------
// Rung view-models
// ---------------------------------------------------------------------------

export interface PackRungItem extends LadderPack {
  /** `priceCents / sessionCount`, rounded — the "that's $25 a class" line.
   *  Null only for a malformed pack with a non-positive session count. */
  perSessionCents: number | null;
}

export interface BlockRungTemplate extends BlockTemplate {
  /** Safe to offer a purchase for. `/api/public/class-blocks` deliberately
   *  still LISTS a slot whose last occurrence has passed (remaining 0) so the
   *  UI can say "no sessions left this term" rather than silently dropping a
   *  class families know exists — but the purchase endpoint refuses it
   *  (`block_over`), so the CTA must not be live. */
  purchasable: boolean;
  /** The family is joining a term already under way and pays only for the
   *  weeks left — drives the "you only pay for the weeks left" line. */
  midBlock: boolean;
}

export interface BlockRungWindow extends Omit<BlockWindow, "templates"> {
  templates: BlockRungTemplate[];
}

export type LadderRung =
  | { kind: "dropin"; fromPriceCents: number }
  | { kind: "packs"; packs: PackRungItem[] }
  | { kind: "block"; block: BlockRungWindow }
  | { kind: "membership"; tiers: LadderTier[] };

export interface LadderInput {
  packs: LadderPack[];
  block: BlockWindow | null;
  tiers: LadderTier[];
  scheduleSlots: LadderScheduleSlot[];
}

export interface LadderModel {
  rungs: LadderRung[];
  /**
   * True when packs, block and tiers are all empty — the caller renders the
   * figure-free fallback explainer. Deliberately NOT `rungs.length === 0`: a
   * drop-in rate alone is a real number worth showing, but it is not a
   * pricing story, so the explainer still earns its place beside it.
   */
  showFallback: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** One clause per rung, in the sentence voice the band's lede uses. */
const RUNG_PHRASE: Record<LadderRung["kind"], string> = {
  dropin: "come to a single class",
  packs: "buy a pack of classes",
  block: "take a block of weeks",
  membership: "go monthly",
};

/**
 * Honest enumeration of the ways in that ACTUALLY exist right now.
 *
 * The page's static header and lede must never count the doors: three of the
 * four rungs (packs, block, drop-in) are catalog-dependent, so a hard-coded
 * "four ways in" would promise four options above a band rendering two — the
 * exact honest-copy failure this project bans. The enumeration therefore
 * lives here, derived from the rungs `assembleLadder` actually produced, and
 * the island renders it under the neutral static heading.
 *
 * Returns null when there is nothing to enumerate (the fallback state), so
 * the caller renders no sentence at all rather than an empty one.
 */
export function ladderSummarySentence(rungs: LadderRung[]): string | null {
  const phrases = rungs.map((rung) => RUNG_PHRASE[rung.kind]);
  if (phrases.length === 0) return null;
  let list: string;
  if (phrases.length === 1) {
    list = phrases[0];
  } else if (phrases.length === 2) {
    list = `${phrases[0]} or ${phrases[1]}`;
  } else {
    list = `${phrases.slice(0, -1).join(", ")}, or ${phrases[phrases.length - 1]}`;
  }
  return `Right now you can ${list}.`;
}

/**
 * Cents → display dollars. Whole-dollar amounts render without cents ($25,
 * not $25.00); anything with a fractional cent value needs BOTH min and max
 * fraction digits pinned to 2 — `maximumFractionDigits` alone lets
 * toLocaleString drop a trailing zero (4990 → "$49.9").
 */
export function formatCents(cents: number | null | undefined): string | null {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return null;
  const hasCents = cents % 100 !== 0;
  return `$${(cents / 100).toLocaleString(undefined, {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: hasCents ? 2 : 0,
  })}`;
}

/** Per-session price of a pack, rounded to the cent. */
export function perSessionCents(priceCents: number, sessionCount: number): number | null {
  if (!Number.isFinite(sessionCount) || sessionCount <= 0) return null;
  return Math.round(priceCents / sessionCount);
}

/**
 * Cheapest single-session class rate across the org's active slot templates —
 * the drop-in rung's "from" price. Null (rung absent) when no template
 * carries a rate: a class with no configured rate must never be quoted off
 * the adult rate card, and a $0 quote is not a sellable drop-in either.
 */
export function dropInFromPriceCents(slots: LadderScheduleSlot[]): number | null {
  let min: number | null = null;
  for (const slot of slots) {
    const rate = slot.sessionRateCents;
    if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    if (min === null || rate < min) min = rate;
  }
  return min;
}

/**
 * Does this membership tier imply CLASS access? Filters out adult/SoccerOne
 * tiers (rental-discount-only, day pass, …) that share the same org.
 * Extracted from class-tiers.tsx, which now imports it from here.
 */
export function isClassTier(tier: LadderTier): boolean {
  const benefits = tier.benefits ?? {};
  const classesPerMonth =
    typeof benefits.classes_per_month === "number" ? benefits.classes_per_month : 0;
  return classesPerMonth > 0 || benefits.unlimited_classes === true;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

export function assembleLadder(input: LadderInput): LadderModel {
  const rungs: LadderRung[] = [];

  const fromPriceCents = dropInFromPriceCents(input.scheduleSlots);
  if (fromPriceCents !== null) {
    rungs.push({ kind: "dropin", fromPriceCents });
  }

  if (input.packs.length > 0) {
    rungs.push({
      kind: "packs",
      packs: input.packs.map((p) => ({
        ...p,
        perSessionCents: perSessionCents(p.priceCents, p.sessionCount),
      })),
    });
  }

  const blockTemplates = (input.block?.templates ?? [])
    .map((t): BlockRungTemplate => ({
      ...t,
      purchasable: t.remainingSessions > 0 && t.spotsLeft > 0,
      // An upcoming block always has remaining === total, so `upcoming` is
      // redundant with the inequality — it is checked anyway so a future
      // endpoint change that pre-quotes a partial upcoming window can't
      // silently turn "starts Sep 15" into "join mid-block".
      midBlock:
        !input.block?.upcoming && t.remainingSessions > 0 && t.remainingSessions < t.totalSessions,
    }))
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

  if (input.block && blockTemplates.length > 0) {
    rungs.push({ kind: "block", block: { ...input.block, templates: blockTemplates } });
  }

  const classTiers = input.tiers
    .filter(isClassTier)
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder);
  if (classTiers.length > 0) {
    rungs.push({ kind: "membership", tiers: classTiers });
  }

  return {
    rungs,
    showFallback:
      input.packs.length === 0 && blockTemplates.length === 0 && classTiers.length === 0,
  };
}
