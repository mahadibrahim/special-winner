export type PersonType = "child" | "adult" | "parent";

export interface PersonContact {
  name: string;
  phone: string | null;
  email: string | null;
  isParentContact: boolean;
}

export interface PersonTodayItem {
  /** The source record kind — drives which check-in/send-link action the card uses. */
  kind: "drop_in_booking" | "field_rental" | "roster_entry";
  /**
   * The id of the backing record:
   *   drop_in_booking → dropInBookings.id
   *   field_rental    → fieldRentals.id
   *   roster_entry    → rosters.id
   */
  targetId: string;
  /** True for drop_in_booking and field_rental; false for roster_entry (game attendance not tracked). */
  canCheckIn: boolean;
  sessionId: string;
  title: string;
  timeLabel: string;
  waiverSigned: boolean;
  hasPhoto: boolean;
  paid: boolean;
  checkedIn: boolean;
}

export interface PersonRegistration {
  id: string;
  label: string;
  sublabel: string;
  status: string;
  paid: boolean;
}

export interface PersonPaymentsSummary {
  totalPaidCents: number;
  outstandingCents: number;
  lastPayment:
    | {
        dateIso: string;
        amountCents: number;
        method: string;
      }
    | null;
}

export interface PersonFamilyMember {
  familyMemberId: string;
  name: string;
  age: number | null;
  summary: string;
}

export interface PersonProfile {
  type: PersonType;
  id: string;
  name: string;
  age: number | null;
  birthDate: string | null;
  contact: PersonContact;
  flags: string[];
  today: PersonTodayItem[];
  registrations: PersonRegistration[];
  payments: PersonPaymentsSummary;
  membership:
    | {
        plan: string;
        renewsIso: string | null;
      }
    | null;
  consents: { kind: string; granted: boolean }[];
  family: PersonFamilyMember[];
}
