import { describe, it, expect } from "vitest";
import { walkInToPayload } from "@/lib/venue/walkin-payload";

const form = {
  mode: "adult" as const,
  firstName: "Alex",
  lastName: "Rivera",
  email: "a@x.com",
  phone: "6145550142",
  dob: "1990-03-15",
  sessionId: "sess-1",
};

describe("walkInToPayload", () => {
  it("maps an adult walk-in paying by email link", () => {
    const p = walkInToPayload(form, { method: "link", linkChannel: "email" }) as any;
    expect(p.sessionId).toBe("sess-1");
    expect(p.contact.firstName).toBe("Alex");
    expect(p.contact.lastName).toBe("Rivera");
    expect(p.contact.email).toBe("a@x.com");
    expect(p.contact.dob).toBe("1990-03-15");
    expect(p.paymentMethod).toBe("link");
    expect(p.linkChannel).toBe("email");
  });

  it("maps a kiosk self-pay hand-off", () => {
    const p = walkInToPayload(form, { method: "kiosk" }) as any;
    expect(p.paymentMethod).toBe("kiosk");
    expect(p.linkChannel).toBeUndefined();
  });

  it("maps a child walk-in with parent fields", () => {
    const childForm = {
      mode: "child" as const,
      firstName: "Jamie",
      lastName: "Rivera",
      email: "",
      phone: "",
      dob: "2015-06-20",
      sessionId: "sess-2",
      parentFirstName: "Alex",
      parentLastName: "Rivera",
      parentEmail: "a@x.com",
      parentPhone: "6145550142",
    };
    const p = walkInToPayload(childForm, { method: "link", linkChannel: "sms" }) as any;
    expect(p.contact.firstName).toBe("Jamie");
    expect(p.contact.dob).toBe("2015-06-20");
    // contact.email must be set to the parent email so the kiosk endpoint's
    // required-field check passes (Fix 2)
    expect(p.contact.email).toBe("a@x.com");
    expect(p.contact.phone).toBe("6145550142");
    expect(p.parent.firstName).toBe("Alex");
    expect(p.parent.email).toBe("a@x.com");
    expect(p.linkChannel).toBe("sms");
  });
});
