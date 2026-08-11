import { describe, it, expect } from "vitest";
import {
  formatOpsPingMessage,
  formatBrandTag,
  INSTANT_KINDS,
  OPS_PING_RATE_LIMIT_PER_HOUR,
} from "@/lib/ops/format";

describe("formatOpsPingMessage", () => {
  it("formats money events with brand tag, kind label, and dollars", () => {
    expect(
      formatOpsPingMessage({
        kind: "registration_paid",
        brand: "aspire",
        eventId: "r1",
        label: "Jordan M. · Fall Soccer U10",
        amountCents: 8500,
      }),
    ).toBe("💰 [Aspire] Registration — Jordan M. · Fall Soccer U10, $85.00");
    expect(
      formatOpsPingMessage({
        kind: "dropin_booked",
        brand: "soccerone",
        eventId: "b1",
        label: "Sam K. · Pickup, Blue Field 9pm",
        amountCents: 1574,
      }),
    ).toBe("💰 [SoccerOne] Drop-in — Sam K. · Pickup, Blue Field 9pm, $15.74");
  });

  it("formats team lifecycle events and pings them instantly", () => {
    expect(
      formatOpsPingMessage({
        kind: "team_reserved",
        brand: "aspire",
        eventId: "t1",
        label: "Sweed Tubz · Fall 2026 — Men's C · fee $975.00",
        amountCents: 20000,
      }),
    ).toBe(
      "🏆 [Aspire] Team reserved — Sweed Tubz · Fall 2026 — Men's C · fee $975.00, $200.00",
    );
    expect(
      formatOpsPingMessage({
        kind: "team_backstop_failed",
        brand: "aspire",
        eventId: "t2",
        label: "Sweed Tubz · $655.00 uncollected (no_saved_card)",
      }),
    ).toBe(
      "🚨 [Aspire] Team backstop FAILED — Sweed Tubz · $655.00 uncollected (no_saved_card)",
    );
    expect(INSTANT_KINDS.has("team_reserved")).toBe(true);
    expect(INSTANT_KINDS.has("team_backstop_charged")).toBe(true);
    expect(INSTANT_KINDS.has("team_backstop_failed")).toBe(true);
  });

  it("formats job applications without a dollar amount and pings instantly", () => {
    expect(
      formatOpsPingMessage({
        kind: "job_application",
        brand: "soccerone",
        eventId: "a1",
        label: "Jordan R. · referee",
      }),
    ).toBe("📝 [SoccerOne] Job application — Jordan R. · referee");
    expect(INSTANT_KINDS.has("job_application")).toBe(true);
  });

  it("formats signups without an amount", () => {
    expect(
      formatOpsPingMessage({
        kind: "user_signup",
        brand: "aspire",
        eventId: "u1",
        label: "new user: sam@example.com",
      }),
    ).toBe("👤 [Aspire] New user — new user: sam@example.com");
  });

  it("formats test pings distinctly", () => {
    expect(
      formatOpsPingMessage({ kind: "test", brand: "aspire", eventId: "t1", label: "hello" }),
    ).toBe("🔔 [Aspire] Test ping — hello");
  });
});

describe("policy constants", () => {
  it("instant kinds cover money + test but never user_signup", () => {
    expect(INSTANT_KINDS.has("registration_paid")).toBe(true);
    expect(INSTANT_KINDS.has("test")).toBe(true);
    expect(INSTANT_KINDS.has("user_signup")).toBe(false);
    expect(OPS_PING_RATE_LIMIT_PER_HOUR).toBe(10);
  });

  it("brand tags capitalize unknown brands", () => {
    expect(formatBrandTag("aspire")).toBe("[Aspire]");
    expect(formatBrandTag("soccerone")).toBe("[SoccerOne]");
    expect(formatBrandTag("futsal")).toBe("[Futsal]");
  });
});
