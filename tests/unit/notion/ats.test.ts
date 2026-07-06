import { describe, expect, it } from "vitest";
import { buildApplicationPageParams } from "@/lib/notion/ats";
import type { JobApplication } from "@/lib/db/schema/job-applications";

const app: JobApplication = {
  id: "11111111-2222-4333-8444-555555555555",
  organizationId: null,
  brand: "aspire",
  role: "referee",
  firstName: "Jordan",
  lastName: "Reyes",
  email: "jordan@example.com",
  phone: "614-555-0100",
  preferredLocation: "worthington",
  certifications: "USSF Grassroots",
  experience: "Three seasons officiating adult coed.",
  availability: ["weeknights", "weekends"],
  resumeKey: "careers/resumes/abc.pdf",
  source: "Instagram",
  status: "new",
  hiredUserId: null,
  notionPageId: null,
  notionSyncedAt: null,
  createdAt: new Date("2026-07-04T12:00:00Z"),
};

describe("buildApplicationPageParams", () => {
  it("maps the application onto the Hiring Pipeline properties", () => {
    const params = buildApplicationPageParams(app, "db-123", "https://aspiresportsohio.com");
    expect(params.parent).toEqual({ database_id: "db-123" });
    const p = params.properties as Record<string, any>;
    expect(p["Name"].title[0].text.content).toBe("Jordan Reyes");
    expect(p["Role"].select.name).toBe("Referee");
    expect(p["Status"].select.name).toBe("New");
    expect(p["Email"].email).toBe("jordan@example.com");
    expect(p["Facility"].select.name).toBe("Worthington");
    expect(p["Availability"].multi_select).toEqual([{ name: "weeknights" }, { name: "weekends" }]);
    expect(p["Resume"].url).toBe(
      "https://aspiresportsohio.com/api/admin/applications/11111111-2222-4333-8444-555555555555/resume",
    );
    expect(p["Applied"].date.start).toBe("2026-07-04");
  });

  it("omits empty optionals instead of sending empty Notion values", () => {
    const bare = { ...app, phone: null, preferredLocation: null, certifications: null, resumeKey: null, source: null, availability: [] };
    const p = buildApplicationPageParams(bare, "db-123", "https://x.test").properties as Record<string, any>;
    expect(p["Phone"]).toBeUndefined();
    expect(p["Facility"]).toBeUndefined();
    expect(p["Resume"]).toBeUndefined();
    expect(p["Availability"]).toBeUndefined();
  });

  it("puts the experience blurb in the page body", () => {
    const params = buildApplicationPageParams(app, "db-123", "https://x.test");
    const children = (params as any).children;
    expect(JSON.stringify(children)).toContain("Three seasons officiating");
  });
});
