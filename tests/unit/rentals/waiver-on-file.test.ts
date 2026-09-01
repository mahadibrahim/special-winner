/**
 * `renterWaiverOnFile` — the DISPLAY-side probe the rentals booking forms use
 * to decide whether to render the waiver checkbox + typed signature at all
 * (`RentalBooking.tsx` on Aspire, `FieldCalendar.tsx` on SoccerOne).
 *
 * This helper is a SAFETY-DIRECTION function, so the interesting behaviour is
 * every path that must return FALSE. Getting it wrong in the false direction
 * is a nuisance (a covered renter ticks one extra box); getting it wrong in
 * the TRUE direction means the form omits `waiverAccepted`/`waiverName`, and
 * then either:
 *   - the server agrees they're covered and the rental is born with no
 *     signature and no consent — a missing legal release, or
 *   - the server DISAGREES and
 *     `validateRentalBookingRequest`'s relaxation doesn't apply, so the
 *     renter hard-422s "waiver must be accepted to book" with no checkbox on
 *     screen to accept — a dead-end form.
 *
 * The forms it feeds live on the post-merge-only Playwright path, so this
 * unit file is the fast gate. It mocks BOTH the db handle and the canonical
 * predicate, so what's under test is exactly this module's own branching:
 * the guard clauses, the person lookup, the error swallow, and the
 * pass-through of the predicate's verdict.
 */
import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";

// `vi.hoisted` is the sanctioned way to share mutable state with a mock
// factory — the factories below are hoisted above every import, so a plain
// top-level `let` would be in its TDZ when they're defined.
const state = vi.hoisted(() => ({
  /** Rows the mocked `family_members` select resolves to. */
  personRows: [] as { id: string }[],
  /** Make the person lookup blow up (a dropped connection, a bad pool). */
  throwOnSelect: false,
  /** What the canonical predicate answers when it's reached at all. */
  waiverValid: false,
  /** Make the predicate itself blow up. */
  throwOnPredicate: false,
  // --- call recorders, so the tests can assert what was NOT done ---
  selectCalls: 0,
  predicateCalls: [] as Array<{ familyMemberId: string; organizationId: string }>,
  /** Chain methods the person query actually used — pins the ordering
   *  contract below. */
  chain: [] as string[],
  limitArg: null as number | null,
}));

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => {
      state.selectCalls += 1;
      state.chain.push("select");
      return {
        from: () => {
          state.chain.push("from");
          return {
            where: () => {
              state.chain.push("where");
              return {
                orderBy: () => {
                  state.chain.push("orderBy");
                  return {
                    limit: async (n: number) => {
                      state.chain.push("limit");
                      state.limitArg = n;
                      if (state.throwOnSelect) {
                        throw new Error("connection terminated unexpectedly");
                      }
                      return state.personRows;
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  }),
}));

vi.mock("@/lib/consents/liability", () => ({
  hasValidLiabilityWaiver: async (familyMemberId: string, organizationId: string) => {
    state.predicateCalls.push({ familyMemberId, organizationId });
    if (state.throwOnPredicate) throw new Error("consents lookup failed");
    return state.waiverValid;
  },
}));

import { renterWaiverOnFile } from "@/lib/rentals/waiver-on-file";

// The helper logs its swallowed errors. Keep the suite output clean, but keep
// the spy so the "it logged rather than silently swallowing" assertion below
// is real.
const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

const USER = "user-1";
const ORG = "org-1";

beforeEach(() => {
  state.personRows = [];
  state.throwOnSelect = false;
  state.waiverValid = false;
  state.throwOnPredicate = false;
  state.selectCalls = 0;
  state.predicateCalls = [];
  state.chain = [];
  state.limitArg = null;
  errorSpy.mockClear();
});

afterAll(() => {
  errorSpy.mockRestore();
});

describe("renterWaiverOnFile — the four ways it must answer FALSE", () => {
  it("(1) no user (a GUEST) → false, and never touches the database", async () => {
    // The guest rental path must be byte-identical to its pre-annual-waiver
    // behaviour: no account means no `family_members` row to key a
    // person-scoped consent off, so there is nothing to skip.
    expect(await renterWaiverOnFile(null, ORG)).toBe(false);
    expect(await renterWaiverOnFile(undefined, ORG)).toBe(false);
    expect(await renterWaiverOnFile("", ORG)).toBe(false);
    // Load-bearing: the guard is what keeps an anonymous page render off the
    // DB entirely, not just off the `true` answer.
    expect(state.selectCalls).toBe(0);
    expect(state.predicateCalls).toEqual([]);
  });

  it("(2) no organization context → false, and never touches the database", async () => {
    // Liability consent is org-scoped. Without a resolved org there is no
    // question to ask — answering `true` here would leak coverage from one
    // tenant into another's form.
    expect(await renterWaiverOnFile(USER, null)).toBe(false);
    expect(await renterWaiverOnFile(USER, undefined)).toBe(false);
    expect(await renterWaiverOnFile(USER, "")).toBe(false);
    expect(state.selectCalls).toBe(0);
    expect(state.predicateCalls).toEqual([]);
  });

  it("(3) no self person row yet → false, and the predicate is never consulted", async () => {
    state.personRows = [];
    // Even a renter whose coverage would be true cannot be covered without a
    // person row — this asserts the short-circuit, not just the verdict.
    state.waiverValid = true;

    expect(await renterWaiverOnFile(USER, ORG)).toBe(false);
    expect(state.selectCalls).toBe(1);
    expect(state.predicateCalls).toEqual([]);
  });

  it("(4a) the person lookup throwing → false (fails toward ASKING), and is logged", async () => {
    state.throwOnSelect = true;
    state.waiverValid = true;

    expect(await renterWaiverOnFile(USER, ORG)).toBe(false);
    // Swallowed, not rethrown: this runs in page frontmatter, and a dropped
    // connection must degrade to showing the waiver, never 500 the rentals
    // page.
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it("(4b) the PREDICATE throwing → false (fails toward ASKING), and is logged", async () => {
    state.personRows = [{ id: "fm-1" }];
    state.throwOnPredicate = true;

    expect(await renterWaiverOnFile(USER, ORG)).toBe(false);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe("renterWaiverOnFile — the affirmative path", () => {
  it("returns the predicate's verdict verbatim for a resolved person", async () => {
    state.personRows = [{ id: "fm-1" }];

    state.waiverValid = true;
    expect(await renterWaiverOnFile(USER, ORG)).toBe(true);

    // ...and does NOT invent coverage when the predicate says no. Without
    // this half, a helper hardcoded to `true` would still pass everything
    // above.
    state.waiverValid = false;
    expect(await renterWaiverOnFile(USER, ORG)).toBe(false);
  });

  it("asks the predicate about the RESOLVED PERSON and the CALLER'S org", async () => {
    state.personRows = [{ id: "fm-canonical" }];
    state.waiverValid = true;

    await renterWaiverOnFile(USER, ORG);

    // Not the user id — consents hang on the `family_members` row. Passing
    // the user id would silently never match and answer false forever.
    expect(state.predicateCalls).toEqual([
      { familyMemberId: "fm-canonical", organizationId: ORG },
    ]);
  });

  it("reads the OLDEST self row, single-shot — the multi-tenant ordering contract", async () => {
    state.personRows = [{ id: "fm-oldest" }];
    state.waiverValid = true;

    await renterWaiverOnFile(USER, ORG);

    // CLAUDE.md's multi-tenant hazard rule: any query that picks "a" row from
    // a set of possible matches MUST order explicitly. `self_user_id` carries
    // an index but NO unique constraint, so duplicates are possible — an
    // unordered limit(1) would pick a different row per run and disagree with
    // `resolvePerson`'s own oldest-first self lookup about which row is
    // canonical.
    expect(state.chain).toEqual(["select", "from", "where", "orderBy", "limit"]);
    expect(state.limitArg).toBe(1);
  });

  it("is READ-ONLY — no insert/create anywhere in the query it builds", async () => {
    state.personRows = [];

    await renterWaiverOnFile(USER, ORG);

    // This runs on every page render, and `self_user_id` has no unique index,
    // so a find-or-CREATE here (i.e. `resolvePerson`) would let two
    // concurrent renders race duplicate self rows — the exact W6 finding that
    // made resolve-signer.ts's field_rental branch a plain select. The mocked
    // db handle exposes ONLY `select`; had the helper reached for `insert`,
    // this call would have thrown rather than returned.
    expect(state.chain[0]).toBe("select");
    expect(state.chain).not.toContain("insert");
  });
});
