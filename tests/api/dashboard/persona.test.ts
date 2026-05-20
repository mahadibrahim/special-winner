import { describe, it, expect } from "vitest";
import { getDashboardDestinations } from "@/lib/dashboard/persona";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { eq } from "drizzle-orm";

describe("getDashboardDestinations", () => {
  it("returns neither for a user with no family members or activity", async () => {
    let userId: string | null = null;
    try {
      const [u] = await getDb()
        .insert(users)
        .values({
          email: `persona-none-${Date.now()}@test.aspiresports.com`,
          firstName: "None",
          lastName: "Persona",
          emailVerified: false,
        })
        .returning();
      userId = u.id;
      const result = await getDashboardDestinations(u.id);
      expect(result).toEqual({ hasFamily: false, hasPlay: false });
    } finally {
      if (userId) await getDb().delete(users).where(eq(users.id, userId));
    }
  });

  it("returns hasFamily for a user with a dependent", async () => {
    let userId: string | null = null;
    let fmId: string | null = null;
    try {
      const [u] = await getDb()
        .insert(users)
        .values({
          email: `persona-parent-${Date.now()}@test.aspiresports.com`,
          firstName: "Parent",
          lastName: "Persona",
          emailVerified: false,
        })
        .returning();
      userId = u.id;
      const [fm] = await getDb()
        .insert(familyMembers)
        .values({
          parentUserId: u.id,
          firstName: "Kid",
          lastName: "Persona",
          birthDate: "2016-01-01",
        })
        .returning();
      fmId = fm.id;
      const result = await getDashboardDestinations(u.id);
      expect(result.hasFamily).toBe(true);
      expect(result.hasPlay).toBe(false);
    } finally {
      if (fmId) await getDb().delete(familyMembers).where(eq(familyMembers.id, fmId));
      if (userId) await getDb().delete(users).where(eq(users.id, userId));
    }
  });

  it("returns hasPlay for a user with a self family member", async () => {
    let userId: string | null = null;
    let fmId: string | null = null;
    try {
      const [u] = await getDb()
        .insert(users)
        .values({
          email: `persona-player-${Date.now()}@test.aspiresports.com`,
          firstName: "Player",
          lastName: "Persona",
          emailVerified: false,
        })
        .returning();
      userId = u.id;
      const [fm] = await getDb()
        .insert(familyMembers)
        .values({
          selfUserId: u.id,
          firstName: "Player",
          lastName: "Persona",
          birthDate: "1992-01-01",
        })
        .returning();
      fmId = fm.id;
      const result = await getDashboardDestinations(u.id);
      expect(result.hasFamily).toBe(false);
      expect(result.hasPlay).toBe(true);
    } finally {
      if (fmId) await getDb().delete(familyMembers).where(eq(familyMembers.id, fmId));
      if (userId) await getDb().delete(users).where(eq(users.id, userId));
    }
  });
});
