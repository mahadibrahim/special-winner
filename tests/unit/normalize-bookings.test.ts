// tests/unit/normalize-bookings.test.ts
import { describe, it, expect } from "vitest";
import {
  normalizeBookings,
  type DropInBookingRow,
  type FieldRentalRow,
} from "@/lib/dashboard/normalize-bookings";

const NOW = new Date("2026-06-20T12:00:00Z").getTime();

function dropin(over: Partial<DropInBookingRow> & { startsAt: string }): DropInBookingRow {
  return {
    id: over.id ?? "d1",
    sessionId: over.sessionId ?? "s1",
    status: over.status ?? "confirmed",
    teamAssignment: over.teamAssignment ?? null,
    checkedInAt: over.checkedInAt ?? null,
    session: {
      sportOrClassLabel: over.session?.sportOrClassLabel ?? "Soccer",
      formatLabel: over.session?.formatLabel ?? "7v7",
      startsAt: over.startsAt,
      endsAt: over.session?.endsAt ?? over.startsAt,
      venueName: over.session?.venueName ?? "Field 1",
    },
  };
}
function rental(over: Partial<FieldRentalRow> & { startsAt: string }): FieldRentalRow {
  return {
    id: over.id ?? "r1",
    fieldNumber: over.fieldNumber ?? 2,
    startsAt: over.startsAt,
    endsAt: over.endsAt ?? over.startsAt,
    status: over.status ?? "confirmed",
    paymentStatus: over.paymentStatus ?? "paid",
    amountPaidCents: over.amountPaidCents ?? 8000,
    partySize: over.partySize ?? 10,
    checkedInAt: over.checkedInAt ?? null,
    paymentExpiresAt: over.paymentExpiresAt ?? null,
    venueName: over.venueName ?? "Worthington",
  };
}

describe("normalizeBookings", () => {
  it("interleaves drop-ins and rentals by time, upcoming ascending", () => {
    const { upcoming } = normalizeBookings(
      [dropin({ id: "d-late", startsAt: "2026-06-24T18:00:00Z" })],
      [rental({ id: "r-soon", startsAt: "2026-06-22T18:00:00Z" })],
      NOW,
    );
    expect(upcoming.map((i) => i.id)).toEqual(["r-soon", "d-late"]);
    expect(upcoming[0].kind).toBe("rental");
    expect(upcoming[1].kind).toBe("dropin");
  });

  it("routes cancelled/no_show and past-dated items to past, descending", () => {
    const { upcoming, past } = normalizeBookings(
      [
        dropin({ id: "d-cancelled", status: "cancelled", startsAt: "2026-06-25T18:00:00Z" }),
        dropin({ id: "d-old", startsAt: "2026-06-18T18:00:00Z" }),
      ],
      [rental({ id: "r-old", startsAt: "2026-06-10T18:00:00Z" })],
      NOW,
    );
    expect(upcoming).toEqual([]);
    expect(past.map((i) => i.id)).toEqual(["d-cancelled", "d-old", "r-old"]);
  });

  it("classifies a class-format drop-in as cardType 'class', else 'pickup'", () => {
    const { upcoming } = normalizeBookings(
      [
        dropin({ id: "p", startsAt: "2026-06-21T18:00:00Z" }),
        dropin({
          id: "c",
          startsAt: "2026-06-22T18:00:00Z",
          session: { sportOrClassLabel: "Finishing Clinic", formatLabel: null, startsAt: "", endsAt: "", venueName: null },
        }),
      ],
      [],
      NOW,
    );
    const byId = Object.fromEntries(upcoming.map((i) => [i.id, i]));
    expect(byId.p.cardType).toBe("pickup");
    expect(byId.c.cardType).toBe("class");
  });

  it("builds titles and maps status tones", () => {
    const { upcoming } = normalizeBookings(
      [dropin({ id: "d", status: "waitlisted", startsAt: "2026-06-21T18:00:00Z" })],
      [rental({ id: "r", status: "pending_payment", fieldNumber: 3, startsAt: "2026-06-22T18:00:00Z" })],
      NOW,
    );
    const byId = Object.fromEntries(upcoming.map((i) => [i.id, i]));
    expect(byId.d.title).toBe("Soccer · 7v7");
    expect(byId.d.status).toEqual({ label: "Waitlisted", tone: "pending" });
    expect(byId.r.title).toBe("Worthington");
    expect(byId.r.status).toEqual({ label: "Pending payment", tone: "action" });
  });

  it("returns empty arrays for empty input", () => {
    expect(normalizeBookings([], [], NOW)).toEqual({ upcoming: [], past: [] });
  });
});
