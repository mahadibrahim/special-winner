import { describe, it, expect } from "vitest";
import { createIncidentSchema } from "@/lib/incidents/incident-schema";

const base = {
  venueId: "11111111-1111-4111-8111-111111111111",
  incidentType: "injury" as const,
  occurredAt: "2026-07-07T18:00:00Z",
  peopleInvolved: "Player #7 and referee",
  firstResponderName: "Coach Jamie",
  immediateCareGiven: "Ice applied, athlete rested on sideline",
  emergencyServicesCalled: false,
  suspectedConcussion: false,
  parentNotifiedOnsite: true,
};

describe("createIncidentSchema", () => {
  it("accepts a valid bystander subject", () => {
    const result = createIncidentSchema.safeParse({
      ...base,
      subject: { subjectType: "bystander", freeTextName: "Jane Spectator" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a valid participant subject", () => {
    const result = createIncidentSchema.safeParse({
      ...base,
      subject: {
        subjectType: "participant",
        familyMemberId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a participant subject missing familyMemberId", () => {
    const result = createIncidentSchema.safeParse({
      ...base,
      subject: { subjectType: "participant" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown subjectType", () => {
    const result = createIncidentSchema.safeParse({
      ...base,
      subject: { subjectType: "referee", freeTextName: "Alex Ref" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a free-text subject missing freeTextName", () => {
    const result = createIncidentSchema.safeParse({
      ...base,
      subject: { subjectType: "staff" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed occurredAt", () => {
    const result = createIncidentSchema.safeParse({
      ...base,
      occurredAt: "not-a-date",
      subject: { subjectType: "other", freeTextName: "Unknown person" },
    });
    expect(result.success).toBe(false);
  });
});
