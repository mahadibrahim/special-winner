import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema/job-applications";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";

let cookie: string;
let organizationId: string;

beforeAll(async () => {
  cookie = await getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");
  ({ organizationId } = await resolveDefaultOrgForHttpTests());
});

async function insertHostApplication(email: string) {
  const [app] = await getDb()
    .insert(jobApplications)
    .values({
      organizationId,
      role: "host",
      firstName: "Hope",
      lastName: "Hoster",
      email,
      phone: "+16145550100",
      preferredLocation: "worthington",
      experience: "Short bio for the game page.",
      gamesPlayed: "5+",
      weeklyCommitment: true,
      photoKey: "careers/hosts/p.jpg",
      motivationVideoKey: "careers/hosts/m.mp4",
      demoVideoKey: "careers/hosts/d.mp4",
    })
    .returning();
  return app;
}

describe("POST /api/admin/applications/:id/approve-host", () => {
  it("creates the user + active host profile, stamps hired; second call 409s", async () => {
    const email = `approve-${Date.now()}@t.example`;
    const app = await insertHostApplication(email);

    const res = await apiFetch(`/api/admin/applications/${app.id}/approve-host`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.approved).toBe(true);

    const [profile] = await getDb()
      .select()
      .from(hostProfiles)
      .where(
        and(
          eq(hostProfiles.userId, body.userId),
          eq(hostProfiles.organizationId, organizationId),
        ),
      );
    expect(profile.status).toBe("active");
    expect(profile.bio).toBe("Short bio for the game page.");
    expect(profile.photoKey).toBe("careers/hosts/p.jpg");
    expect(profile.applicationId).toBe(app.id);

    const [stamped] = await getDb()
      .select({ status: jobApplications.status })
      .from(jobApplications)
      .where(eq(jobApplications.id, app.id));
    expect(stamped.status).toBe("hired");

    const again = await apiFetch(`/api/admin/applications/${app.id}/approve-host`, {
      method: "POST",
      cookie,
    });
    expect(again.status).toBe(409);
  });

  it("rejects non-host applications", async () => {
    const [refApp] = await getDb()
      .insert(jobApplications)
      .values({
        organizationId,
        role: "referee",
        firstName: "R",
        lastName: "E",
        email: `ref-${Date.now()}@t.example`,
        experience: "x",
      })
      .returning();
    const res = await apiFetch(`/api/admin/applications/${refApp.id}/approve-host`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(400);
  });
});
