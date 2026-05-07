import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { users } from "@/lib/db/schema/users";
import { resolveRecipientsForRole } from "@/lib/activity-tracking/resolve-recipients";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";

describe("resolveRecipientsForRole", () => {
  it("returns users currently assigned to (venue, role)", async () => {
    const ctx = await createTestGameContext({});
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [u] = await getDb()
      .insert(users)
      .values({
        email: `vm-${stamp}@test.com`,
        firstName: "Venue",
        lastName: "Manager",
        messagingPrimaryChannel: "email",
      })
      .returning();
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId,
      venueId: ctx.venueId,
      roleId: "role.venue_manager",
      userId: u.id,
    });

    const recipients = await resolveRecipientsForRole(
      ctx.venueId,
      "role.venue_manager",
    );
    expect(recipients.map((r) => r.id)).toContain(u.id);
    const found = recipients.find((r) => r.id === u.id);
    expect(found?.email).toBe(`vm-${stamp}@test.com`);
  });

  it("excludes assignments past effective_to", async () => {
    const ctx = await createTestGameContext({});
    const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const [u] = await getDb()
      .insert(users)
      .values({
        email: `e-${stamp}@t.com`,
        firstName: "Expired",
        lastName: "User",
      })
      .returning();
    await getDb().insert(venueRoleAssignments).values({
      organizationId: ctx.organizationId,
      venueId: ctx.venueId,
      roleId: "role.facilities",
      userId: u.id,
      effectiveFrom: new Date(Date.now() - 86400_000 * 2),
      effectiveTo: new Date(Date.now() - 86400_000),
    });

    const recipients = await resolveRecipientsForRole(
      ctx.venueId,
      "role.facilities",
    );
    expect(recipients.map((r) => r.id)).not.toContain(u.id);
  });
});
