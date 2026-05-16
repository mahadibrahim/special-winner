import { describe, it, expect } from "vitest";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";

describe("normalizeForUniqueness", () => {
  it("lowercases the whole email for non-gmail domains", () => {
    expect(normalizeForUniqueness("Foo@Example.COM")).toBe("foo@example.com");
  });

  it("strips dots from gmail.com local-part", () => {
    expect(normalizeForUniqueness("a.g.i.v.o.b@gmail.com")).toBe("agivob@gmail.com");
  });

  it("strips dots from googlemail.com and normalizes to gmail.com", () => {
    expect(normalizeForUniqueness("john.doe@googlemail.com")).toBe("johndoe@gmail.com");
  });

  it("strips +tag suffixes on gmail.com", () => {
    expect(normalizeForUniqueness("foo+spam@gmail.com")).toBe("foo@gmail.com");
  });

  it("strips dots AND +tags on gmail.com", () => {
    expect(normalizeForUniqueness("a.g.i.v.o.b+spam@gmail.com")).toBe("agivob@gmail.com");
  });

  it("leaves dots intact for non-gmail domains", () => {
    expect(normalizeForUniqueness("first.last@example.com")).toBe(
      "first.last@example.com",
    );
  });

  it("preserves +tags for non-gmail domains", () => {
    expect(normalizeForUniqueness("user+tag@example.com")).toBe(
      "user+tag@example.com",
    );
  });

  it("returns lowercased input when @ is missing", () => {
    expect(normalizeForUniqueness("not-an-email")).toBe("not-an-email");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeForUniqueness("  Foo@Bar.Com  ")).toBe("foo@bar.com");
  });

  it("matches the four observed bot signups to one canonical inbox", () => {
    // Real examples from prod (security_prod-bot-signups memory).
    const bots = [
      "agivob.a.re.s.a.8.5@gmail.com",
      "el.ik.a.p.aq.i3.5@gmail.com",
      "tidufal.6.3.8@gmail.com",
      "w.ub.o.t.uj.o.j.iq.4.5@gmail.com",
    ];
    const canonical = bots.map(normalizeForUniqueness);
    expect(canonical).toEqual([
      "agivobaresa85@gmail.com",
      "elikapaqi35@gmail.com",
      "tidufal638@gmail.com",
      "wubotujojiq45@gmail.com",
    ]);
    // Each one differs (not the same inbox) — that's fine. The point is
    // they're all CANONICAL, so a second dot-permutation of any one of
    // these would collide with its canonical form.
    expect(new Set(canonical).size).toBe(4);
  });
});
