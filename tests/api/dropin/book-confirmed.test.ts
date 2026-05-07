import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { eq } from "drizzle-orm";
import { createConfirmedBookingFreePath } from "@/lib/dropin/booking";
import { createTestDropInSession } from "../../utils/dropin-helpers";

describe("createConfirmedBookingFreePath", () => {
  it("creates a confirmed $0 booking when session is free-rate-overridden", async () => {
    // Override both rates to 0 so the public-pricing path lands on $0.
    // (Membership stub returns null, so the only way to reach a $0
    // rate is via session-level overrides.)
    const ctx = await createTestDropInSession({
      capacity: 16,
      sessionRateCents: 0,
      memberRateCents: 0,
    });

    const [u] = await getDb()
      .insert(users)
      .values({
        email: `t-${Date.now()}-${Math.random()}@t.example`,
        firstName: "T",
        lastName: "User",
      })
      .returning();

    const result = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u.id,
      source: "online_booking",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.amountCents).toBe(0);
      expect(["orange", "black"]).toContain(result.teamAssignment);
      const [row] = await getDb()
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.id, result.bookingId));
      expect(row.status).toBe("confirmed");
      expect(row.source).toBe("online_booking");
      expect(row.amountPaidCents).toBe(0);
    }
  });

  it("rejects when the user already has an active booking", async () => {
    const ctx = await createTestDropInSession({
      capacity: 16,
      sessionRateCents: 0,
      memberRateCents: 0,
    });

    const [u] = await getDb()
      .insert(users)
      .values({
        email: `t-${Date.now()}-${Math.random()}@t.example`,
        firstName: "T",
        lastName: "User",
      })
      .returning();

    const first = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u.id,
      source: "online_booking",
    });
    expect(first.ok).toBe(true);

    const second = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u.id,
      source: "online_booking",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.code).toBe("already_booked");
    }
  });

  it("returns non_free_rate when membership is missing on a paid session", async () => {
    // Default rate card: sessionRate=1500, memberRate=1200. With membership stub null,
    // resolveRate yields amountCents=1500 → orchestrator refuses (paid path).
    const ctx = await createTestDropInSession({ capacity: 16 });

    const [u] = await getDb()
      .insert(users)
      .values({
        email: `t-${Date.now()}-${Math.random()}@t.example`,
        firstName: "T",
        lastName: "User",
      })
      .returning();

    const result = await createConfirmedBookingFreePath({
      sessionId: ctx.sessionId,
      userId: u.id,
      source: "online_booking",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("non_free_rate");
    }
  });
});
