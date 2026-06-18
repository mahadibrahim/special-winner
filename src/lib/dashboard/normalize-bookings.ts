// src/lib/dashboard/normalize-bookings.ts
import type { CardType } from "@/lib/dashboard/card-types";
import type { StatusTone } from "@/lib/dashboard/dashboard-ui";

export interface DropInBookingRow {
  id: string;
  sessionId: string;
  status: "confirmed" | "waitlisted" | "pending_claim" | "cancelled" | "no_show";
  teamAssignment: string | null;
  checkedInAt: string | null;
  session: {
    sportOrClassLabel: string;
    formatLabel: string | null;
    startsAt: string;
    endsAt: string;
    venueName: string | null;
  };
}

export interface FieldRentalRow {
  id: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  status: "confirmed" | "pending_payment" | "cancelled" | "no_show" | "completed";
  paymentStatus: string;
  amountPaidCents: number;
  partySize: number;
  checkedInAt: string | null;
  paymentExpiresAt: string | null;
  venueName: string;
}

export type BookingKind = "dropin" | "rental";

export interface BookingItem {
  id: string;
  kind: BookingKind;
  cardType: CardType;
  title: string;
  startsAt: string;
  endsAt: string | null;
  venueName: string | null;
  status: { label: string; tone: StatusTone };
  isPast: boolean;
  dropin?: DropInBookingRow;
  rental?: FieldRentalRow;
}

function dropInStatus(s: DropInBookingRow["status"]): { label: string; tone: StatusTone } {
  switch (s) {
    case "confirmed": return { label: "Confirmed", tone: "confirmed" };
    case "waitlisted": return { label: "Waitlisted", tone: "pending" };
    case "pending_claim": return { label: "Pending claim", tone: "action" };
    case "cancelled": return { label: "Cancelled", tone: "pending" };
    case "no_show": return { label: "No show", tone: "pending" };
  }
}

function rentalStatus(s: FieldRentalRow["status"]): { label: string; tone: StatusTone } {
  switch (s) {
    case "confirmed": return { label: "Confirmed", tone: "confirmed" };
    case "completed": return { label: "Completed", tone: "confirmed" };
    case "pending_payment": return { label: "Pending payment", tone: "action" };
    case "cancelled": return { label: "Cancelled", tone: "pending" };
    case "no_show": return { label: "No show", tone: "pending" };
  }
}

function isClass(d: DropInBookingRow): boolean {
  const fmt = d.session.formatLabel?.toLowerCase() ?? "";
  const label = d.session.sportOrClassLabel.toLowerCase();
  return fmt.includes("class") || label.includes("class") || label.includes("clinic");
}

export function normalizeBookings(
  dropins: DropInBookingRow[],
  rentals: FieldRentalRow[],
  now: number,
): { upcoming: BookingItem[]; past: BookingItem[] } {
  const items: BookingItem[] = [];

  for (const d of dropins) {
    const startsAt = d.session.startsAt;
    const terminal = d.status === "cancelled" || d.status === "no_show";
    items.push({
      id: d.id,
      kind: "dropin",
      cardType: isClass(d) ? "class" : "pickup",
      title: d.session.formatLabel
        ? `${d.session.sportOrClassLabel} · ${d.session.formatLabel}`
        : d.session.sportOrClassLabel,
      startsAt,
      endsAt: d.session.endsAt,
      venueName: d.session.venueName,
      status: dropInStatus(d.status),
      isPast: terminal || new Date(startsAt).getTime() <= now,
      dropin: d,
    });
  }

  for (const r of rentals) {
    const terminal = r.status === "cancelled" || r.status === "no_show";
    items.push({
      id: r.id,
      kind: "rental",
      cardType: "field_rental",
      title: `Field ${r.fieldNumber}`,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
      venueName: r.venueName,
      status: rentalStatus(r.status),
      isPast: terminal || new Date(r.startsAt).getTime() <= now,
      rental: r,
    });
  }

  const asc = (a: BookingItem, b: BookingItem) =>
    new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();

  const upcoming = items.filter((i) => !i.isPast).sort(asc);
  const past = items.filter((i) => i.isPast).sort((a, b) => asc(b, a));
  return { upcoming, past };
}
