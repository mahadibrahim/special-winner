import { describe, it, expect } from "vitest";
import { guestCheckoutSchema } from "@/pages/api/registrations/guest-checkout";

const SEASON_ID = "11111111-1111-4111-8111-111111111111";

describe("guestCheckoutSchema — adult self path (v2 deferred waiver/DOB)", () => {
  it("accepts a v2 adult payload with no birthDate and no waiverSignedBy", () => {
    const r = guestCheckoutSchema.safeParse({
      seasonId: SEASON_ID,
      registrant: {
        firstName: "Wave",
        lastName: "One",
        email: "wave1@test.aspiresports.com",
        isSelf: true,
      },
      registrationType: "full",
      waiverSigned: false,
    });
    expect(r.success).toBe(true);
  });

  it("still accepts birthDate + waiverSignedBy when the caller supplies them", () => {
    const r = guestCheckoutSchema.safeParse({
      seasonId: SEASON_ID,
      registrant: {
        firstName: "Sam",
        lastName: "Adult",
        email: "sam@test.aspiresports.com",
        birthDate: "1985-06-15",
        isSelf: true,
      },
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "Sam Adult",
    });
    expect(r.success).toBe(true);
  });

  it("rejects waiverSigned:true without a waiverSignedBy signature", () => {
    const r = guestCheckoutSchema.safeParse({
      seasonId: SEASON_ID,
      registrant: {
        firstName: "A",
        lastName: "B",
        email: "x@test.aspiresports.com",
        isSelf: true,
      },
      registrationType: "full",
      waiverSigned: true,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find(
        (i) => i.path.join(".") === "waiverSignedBy",
      );
      expect(issue).toBeTruthy();
    }
  });

  it("rejects waiverSigned:true with a blank waiverSignedBy", () => {
    const r = guestCheckoutSchema.safeParse({
      seasonId: SEASON_ID,
      registrant: {
        firstName: "A",
        lastName: "B",
        email: "x@test.aspiresports.com",
        isSelf: true,
      },
      registrationType: "full",
      waiverSigned: true,
      waiverSignedBy: "   ",
    });
    expect(r.success).toBe(false);
  });
});

describe("guestCheckoutSchema — legacy parent+child path (byte-identical)", () => {
  const legacyBody = {
    seasonId: SEASON_ID,
    parent: {
      firstName: "Guest",
      lastName: "Tester",
      email: "guest@test.aspiresports.com",
      phone: "+15555550100",
    },
    child: {
      firstName: "Kid",
      lastName: "Tester",
      birthDate: "2018-06-01",
      gender: "male" as const,
    },
    registrationType: "full" as const,
    waiverSigned: true,
    waiverSignedBy: "Guest Tester",
  };

  it("still parses the legacy payload unchanged", () => {
    const r = guestCheckoutSchema.safeParse(legacyBody);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).toEqual(legacyBody);
    }
  });

  it("still requires waiverSignedBy on the legacy shape (no deferral there)", () => {
    const { waiverSignedBy, ...rest } = legacyBody;
    void waiverSignedBy;
    const r = guestCheckoutSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it("still requires child.birthDate on the legacy shape", () => {
    const r = guestCheckoutSchema.safeParse({
      ...legacyBody,
      child: { firstName: "Kid", lastName: "Tester", gender: "male" as const },
    });
    expect(r.success).toBe(false);
  });
});
