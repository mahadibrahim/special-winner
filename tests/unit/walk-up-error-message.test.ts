/**
 * `walkUpErrorMessage` — what the front-desk panel shows when
 * POST /api/admin/dropin/sessions/:id/walk-up refuses.
 *
 * The panel used to toast a blanket "Walk-up failed — see console" for every
 * 4xx, which hid the one thing the person at the desk could act on. Two
 * response shapes are in play: the endpoint's plain `{ error: "…" }` strings
 * and the coded `{ error: { code, message } }` the class guard returns.
 * Rendering the latter naively would put an OBJECT into a toast (React
 * throws), so the extraction is a pure function with its own test.
 */
import { describe, it, expect } from "vitest";
import {
  WALK_UP_ERROR_FALLBACK,
  walkUpErrorMessage,
} from "@/lib/admin/walk-up-error";
import {
  CLASS_REQUIRES_CHILD,
  CLASS_REQUIRES_CHILD_DESK_MESSAGE,
} from "@/lib/classes/class-walkup";

describe("walkUpErrorMessage", () => {
  it("passes a plain string error straight through", () => {
    expect(walkUpErrorMessage({ error: "Session not open for booking" })).toBe(
      "Session not open for booking",
    );
  });

  it("prefers the nested message over the machine code", () => {
    expect(
      walkUpErrorMessage({
        error: { code: CLASS_REQUIRES_CHILD, message: CLASS_REQUIRES_CHILD_DESK_MESSAGE },
      }),
    ).toBe(CLASS_REQUIRES_CHILD_DESK_MESSAGE);
  });

  it("falls back to the nested code when there is no message", () => {
    expect(walkUpErrorMessage({ error: { code: "rate_card_missing" } })).toBe(
      "rate_card_missing",
    );
  });

  it("reads a sibling top-level message (the class-rate 409 shape)", () => {
    expect(
      walkUpErrorMessage({
        error: "class_rate_not_configured",
        message: "This class is missing its pricing — contact the front desk",
      }),
      // `error` is a string here, so it wins — the code IS the string the
      // server chose to put in `error`. Documented rather than asserted the
      // other way round: both are honest, and this keeps the rule simple.
    ).toBe("class_rate_not_configured");
  });

  it("never returns an object or crashes on junk", () => {
    for (const junk of [null, undefined, 42, "boom", {}, { error: {} }, { error: 7 }]) {
      const out = walkUpErrorMessage(junk);
      expect(typeof out).toBe("string");
    }
    expect(walkUpErrorMessage({})).toBe(WALK_UP_ERROR_FALLBACK);
    expect(walkUpErrorMessage({ error: {} })).toBe(WALK_UP_ERROR_FALLBACK);
  });
});
