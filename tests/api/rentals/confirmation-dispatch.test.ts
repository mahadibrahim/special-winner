/**
 * Integration: dispatchRentalConfirmation loads the rental + venue/org and
 * routes to the right channel (ISS-4). Runs against the DB (CI).
 *
 * Email/SMS aren't configured in the test env, so we assert the routing
 * decision (which contact channel it chose / guarded on) rather than a real
 * send — the message *content* is covered by the renderer unit tests.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { dispatchRentalConfirmation } from "@/lib/rentals/messages/dispatch";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

let orgId: string;
let venueId: string;

async function makeRental(opts: {
  renterEmail?: string | null;
  renterPhone?: string | null;
}): Promise<string> {
  const [r] = await getDb()
    .insert(fieldRentals)
    .values({
      organizationId: orgId,
      venueId,
      fieldNumber: 1,
      startsAt: new Date("2026-06-20T22:00:00.000Z"),
      endsAt: new Date("2026-06-20T23:30:00.000Z"),
      status: "confirmed",
      source: "online_booking",
      renterName: "Sam Renter",
      renterEmail: opts.renterEmail ?? null,
      renterPhone: opts.renterPhone ?? null,
      paymentMethod: "card_online",
      amountDueCents: 8000,
      amountPaidCents: 8000,
      paymentStatus: "paid",
    })
    .returning();
  return r.id;
}

beforeAll(async () => {
  const ctx = await createTestGameContext({});
  orgId = ctx.organizationId;
  venueId = ctx.venueId;
});

describe("dispatchRentalConfirmation", () => {
  it("returns rental_not_found for an unknown id", async () => {
    const r = await dispatchRentalConfirmation(
      "00000000-0000-0000-0000-000000000000",
    );
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("rental_not_found");
  });

  it("guards a rental with no contact info", async () => {
    const id = await makeRental({ renterEmail: null, renterPhone: null });
    const r = await dispatchRentalConfirmation(id);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_contact_info");
  });

  it("routes to email when a renter email is present (renders without throwing)", async () => {
    const id = await makeRental({ renterEmail: "renter@example.com" });
    const r = await dispatchRentalConfirmation(id);
    // Email may or may not be configured in CI; either way it must have chosen
    // the email channel, not bailed on missing contact info.
    expect(r.reason).not.toBe("no_contact_info");
    expect(r.reason).not.toBe("rental_not_found");
    if (!r.ok) {
      expect(["email_not_configured", "email_failed"]).toContain(r.reason);
    }
  });
});
