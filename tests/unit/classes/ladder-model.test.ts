import { describe, it, expect } from "vitest";
import {
  assembleLadder,
  dropInFromPriceCents,
  formatCents,
  isClassTier,
  ladderSummarySentence,
  perSessionCents,
  type BlockTemplate,
  type BlockWindow,
  type LadderPack,
  type LadderScheduleSlot,
  type LadderTier,
} from "@/lib/classes/ladder-model";

const slot = (sessionRateCents: number | null): LadderScheduleSlot => ({ sessionRateCents });

const pack = (over: Partial<LadderPack> = {}): LadderPack => ({
  id: "pack-1",
  name: "5-Class Pack",
  sessionCount: 5,
  priceCents: 12500,
  expiryMonths: 6,
  ...over,
});

const template = (over: Partial<BlockTemplate> = {}): BlockTemplate => ({
  slotTemplateId: "tpl-1",
  name: "Minis Tuesday",
  weekday: 2,
  startTime: "17:30:00",
  venueName: "Worthington Fieldhouse",
  spotsLeft: 4,
  totalSessions: 8,
  remainingSessions: 8,
  fullPriceCents: 24000,
  proratedPriceCents: 24000,
  ...over,
});

const block = (over: Partial<BlockWindow> = {}): BlockWindow => ({
  id: "blk-1",
  name: "Fall Block",
  startDate: "2026-09-15",
  endDate: "2026-11-07",
  upcoming: false,
  templates: [template()],
  ...over,
});

const tier = (over: Partial<LadderTier> = {}): LadderTier => ({
  id: "tier-1",
  name: "Weekly",
  tagline: null,
  monthlyPriceCents: 9900,
  annualPriceCents: null,
  annualFeeCents: null,
  benefits: { classes_per_month: 4 },
  displayOrder: 1,
  ...over,
});

const EMPTY = { packs: [], block: null, tiers: [], scheduleSlots: [] };

describe("formatCents", () => {
  it("renders whole dollars without cents", () => {
    expect(formatCents(2500)).toBe("$25");
  });
  it("pins both fraction digits so a trailing zero survives", () => {
    expect(formatCents(4990)).toBe("$49.90");
  });
  it("groups thousands", () => {
    expect(formatCents(120000)).toBe("$1,200");
  });
  it("returns null for null/undefined", () => {
    expect(formatCents(null)).toBeNull();
    expect(formatCents(undefined)).toBeNull();
  });
});

describe("perSessionCents", () => {
  it("rounds to the nearest cent", () => {
    expect(perSessionCents(12500, 5)).toBe(2500);
    expect(perSessionCents(10000, 3)).toBe(3333);
  });
  it("is null when the session count is not a positive number", () => {
    expect(perSessionCents(12500, 0)).toBeNull();
    expect(perSessionCents(12500, -2)).toBeNull();
  });
});

describe("dropInFromPriceCents", () => {
  it("takes the cheapest non-null slot rate", () => {
    expect(dropInFromPriceCents([slot(3000), slot(null), slot(2200), slot(4000)])).toBe(2200);
  });
  it("is null when no slot carries a rate", () => {
    expect(dropInFromPriceCents([slot(null), slot(null)])).toBeNull();
    expect(dropInFromPriceCents([])).toBeNull();
  });
  it("ignores non-positive rates rather than quoting a $0 drop-in", () => {
    expect(dropInFromPriceCents([slot(0), slot(2500)])).toBe(2500);
    expect(dropInFromPriceCents([slot(0)])).toBeNull();
  });
});

describe("isClassTier", () => {
  it("keeps tiers with a monthly class allotment or unlimited classes", () => {
    expect(isClassTier(tier({ benefits: { classes_per_month: 4 } }))).toBe(true);
    expect(isClassTier(tier({ benefits: { unlimited_classes: true } }))).toBe(true);
  });
  it("drops rental/day-pass tiers that imply no classes", () => {
    expect(isClassTier(tier({ benefits: { classes_per_month: 0 } }))).toBe(false);
    expect(isClassTier(tier({ benefits: {} }))).toBe(false);
  });
});

describe("ladderSummarySentence", () => {
  it("enumerates ONLY the rungs that assembled, never a fixed count", () => {
    const model = assembleLadder({
      packs: [],
      block: null,
      tiers: [tier()],
      scheduleSlots: [slot(2500)],
    });
    // The catalog carries a drop-in rate and a tier and nothing else, so the
    // copy must promise exactly two ways in — not the four the band can show
    // at full catalog. This is the honest-copy guard.
    expect(ladderSummarySentence(model.rungs)).toBe(
      "Right now you can come to a single class or go monthly.",
    );
  });

  it("lists all four with a serial comma when the whole ladder assembles", () => {
    const model = assembleLadder({
      packs: [pack()],
      block: block(),
      tiers: [tier()],
      scheduleSlots: [slot(2500)],
    });
    expect(ladderSummarySentence(model.rungs)).toBe(
      "Right now you can come to a single class, buy a pack of classes, take a block of weeks, or go monthly.",
    );
  });

  it("renders a single rung without a conjunction", () => {
    const model = assembleLadder({
      packs: [],
      block: null,
      tiers: [],
      scheduleSlots: [slot(2500)],
    });
    expect(ladderSummarySentence(model.rungs)).toBe("Right now you can come to a single class.");
  });

  it("returns null with no rungs, so the fallback state prints no sentence", () => {
    expect(ladderSummarySentence([])).toBeNull();
    const empty = assembleLadder({ packs: [], block: null, tiers: [], scheduleSlots: [] });
    expect(empty.showFallback).toBe(true);
    expect(ladderSummarySentence(empty.rungs)).toBeNull();
  });
});

describe("assembleLadder", () => {
  it("orders the rungs drop-in → packs → block → membership", () => {
    const model = assembleLadder({
      packs: [pack()],
      block: block(),
      tiers: [tier()],
      scheduleSlots: [slot(2500)],
    });
    expect(model.rungs.map((r) => r.kind)).toEqual(["dropin", "packs", "block", "membership"]);
    expect(model.showFallback).toBe(false);
  });

  it("omits every rung whose data is empty (fail-soft)", () => {
    const model = assembleLadder({
      packs: [],
      block: null,
      tiers: [tier()],
      scheduleSlots: [slot(null)],
    });
    expect(model.rungs.map((r) => r.kind)).toEqual(["membership"]);
  });

  it("renders nothing and asks for the fallback when the whole catalog is empty", () => {
    const model = assembleLadder(EMPTY);
    expect(model.rungs).toEqual([]);
    expect(model.showFallback).toBe(true);
  });

  it("asks for the fallback when only a drop-in rate exists (no packs, block or tiers)", () => {
    const model = assembleLadder({ ...EMPTY, scheduleSlots: [slot(2500)] });
    expect(model.rungs.map((r) => r.kind)).toEqual(["dropin"]);
    expect(model.showFallback).toBe(true);
  });

  it("drops non-class tiers from the membership rung, and the rung with them", () => {
    const rentalOnly = tier({ id: "rental", benefits: { rental_discount_pct: 10 } });
    expect(assembleLadder({ ...EMPTY, tiers: [rentalOnly] }).rungs).toEqual([]);
    const model = assembleLadder({ ...EMPTY, tiers: [rentalOnly, tier({ id: "keep" })] });
    expect(model.rungs).toHaveLength(1);
    const rung = model.rungs[0];
    if (rung.kind !== "membership") throw new Error("expected a membership rung");
    expect(rung.tiers.map((t) => t.id)).toEqual(["keep"]);
  });

  it("sorts membership tiers by displayOrder", () => {
    const model = assembleLadder({
      ...EMPTY,
      tiers: [tier({ id: "b", displayOrder: 3 }), tier({ id: "a", displayOrder: 1 })],
    });
    const rung = model.rungs[0];
    if (rung.kind !== "membership") throw new Error("expected a membership rung");
    expect(rung.tiers.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("adds per-session math to each pack", () => {
    const model = assembleLadder({ ...EMPTY, packs: [pack({ priceCents: 12500, sessionCount: 5 })] });
    const rung = model.rungs[0];
    if (rung.kind !== "packs") throw new Error("expected a packs rung");
    expect(rung.packs[0].perSessionCents).toBe(2500);
  });

  it("marks a mid-block template as prorated and purchasable", () => {
    const model = assembleLadder({
      ...EMPTY,
      block: block({
        templates: [template({ totalSessions: 8, remainingSessions: 3, proratedPriceCents: 9000 })],
      }),
    });
    const rung = model.rungs[0];
    if (rung.kind !== "block") throw new Error("expected a block rung");
    expect(rung.block.templates[0]).toMatchObject({ midBlock: true, purchasable: true });
  });

  it("never marks a template with no sessions left as purchasable", () => {
    const model = assembleLadder({
      ...EMPTY,
      block: block({
        templates: [template({ remainingSessions: 0, proratedPriceCents: 0 })],
      }),
    });
    const rung = model.rungs[0];
    if (rung.kind !== "block") throw new Error("expected a block rung");
    expect(rung.block.templates[0]).toMatchObject({ midBlock: false, purchasable: false });
  });

  it("never marks a full template as purchasable", () => {
    const model = assembleLadder({
      ...EMPTY,
      block: block({ templates: [template({ spotsLeft: 0 })] }),
    });
    const rung = model.rungs[0];
    if (rung.kind !== "block") throw new Error("expected a block rung");
    expect(rung.block.templates[0].purchasable).toBe(false);
  });

  it("an upcoming block is never mid-block even when the two prices differ", () => {
    const model = assembleLadder({
      ...EMPTY,
      block: block({
        upcoming: true,
        templates: [template({ totalSessions: 8, remainingSessions: 8 })],
      }),
    });
    const rung = model.rungs[0];
    if (rung.kind !== "block") throw new Error("expected a block rung");
    expect(rung.block.templates[0].midBlock).toBe(false);
  });

  it("omits the block rung when the window carries no sellable template", () => {
    expect(assembleLadder({ ...EMPTY, block: block({ templates: [] }) }).rungs).toEqual([]);
  });

  it("sorts block templates by weekday then start time", () => {
    const model = assembleLadder({
      ...EMPTY,
      block: block({
        templates: [
          template({ slotTemplateId: "thu", weekday: 4, startTime: "17:00:00" }),
          template({ slotTemplateId: "tue-late", weekday: 2, startTime: "18:30:00" }),
          template({ slotTemplateId: "tue-early", weekday: 2, startTime: "17:00:00" }),
        ],
      }),
    });
    const rung = model.rungs[0];
    if (rung.kind !== "block") throw new Error("expected a block rung");
    expect(rung.block.templates.map((t) => t.slotTemplateId)).toEqual([
      "tue-early",
      "tue-late",
      "thu",
    ]);
  });
});
