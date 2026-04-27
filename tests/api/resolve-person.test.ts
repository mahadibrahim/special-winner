import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { familyMembers, users } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import { resolvePerson } from "@/lib/registrations/resolve-person";

describe("resolvePerson", () => {
  it("returns existing self row if one exists for the user", async () => {
    const db = getDb();
    const [u] = await db
      .select()
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1);
    expect(u).toBeDefined();

    // Pre-clean to avoid leaks from prior runs
    await db.delete(familyMembers).where(eq(familyMembers.selfUserId, u.id));

    const [existing] = await db
      .insert(familyMembers)
      .values({
        selfUserId: u.id,
        firstName: u.firstName ?? "T",
        lastName: u.lastName ?? "U",
        birthDate: "1990-01-01",
      })
      .returning();

    try {
      const got = await resolvePerson(db, {
        kind: "self",
        user: {
          id: u.id,
          firstName: u.firstName ?? "T",
          lastName: u.lastName ?? "U",
          birthDate: "1990-01-01",
        },
      });
      expect(got.id).toBe(existing.id);
    } finally {
      await db.delete(familyMembers).where(eq(familyMembers.id, existing.id));
    }
  });

  it("creates a self row on first call when none exists for the user", async () => {
    const db = getDb();
    // Create a fresh throwaway user so we don't collide with seed users
    const email = `resolve-self-${Date.now()}-${Math.random().toString(36).slice(2)}@test.aspire`;
    const [u] = await db
      .insert(users)
      .values({
        email,
        firstName: "New",
        lastName: "Adult",
        passwordHash: null,
        emailVerified: true,
      })
      .returning();

    try {
      const got = await resolvePerson(db, {
        kind: "self",
        user: { id: u.id, firstName: "New", lastName: "Adult", birthDate: "1990-01-01" },
      });
      expect(got.selfUserId).toBe(u.id);
      expect(got.parentUserId).toBeNull();
    } finally {
      // FK cascade deletes the family_members row when we delete the user
      await db.delete(users).where(eq(users.id, u.id));
    }
  });

  it("dedupes dependent by parent + lower(name) + DOB", async () => {
    const db = getDb();
    const [u] = await db
      .select()
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1);

    let firstId: string | undefined;
    try {
      const first = await resolvePerson(db, {
        kind: "dependent",
        parentUserId: u.id,
        firstName: "Dedup",
        lastName: "Child",
        birthDate: "2015-01-01",
      });
      firstId = first.id;
      const second = await resolvePerson(db, {
        kind: "dependent",
        parentUserId: u.id,
        firstName: "Dedup",
        lastName: "Child",
        birthDate: "2015-01-01",
      });
      expect(second.id).toBe(first.id);
    } finally {
      if (firstId) {
        await db.delete(familyMembers).where(eq(familyMembers.id, firstId));
      }
    }
  });

  it("dedupes dependent case-insensitively on name", async () => {
    const db = getDb();
    const [u] = await db
      .select()
      .from(users)
      .orderBy(asc(users.createdAt))
      .limit(1);

    let firstId: string | undefined;
    try {
      const first = await resolvePerson(db, {
        kind: "dependent",
        parentUserId: u.id,
        firstName: "DeDuP",
        lastName: "ChIlD",
        birthDate: "2015-02-02",
      });
      firstId = first.id;
      const second = await resolvePerson(db, {
        kind: "dependent",
        parentUserId: u.id,
        firstName: "dedup",
        lastName: "child",
        birthDate: "2015-02-02",
      });
      expect(second.id).toBe(first.id);
    } finally {
      if (firstId) {
        await db.delete(familyMembers).where(eq(familyMembers.id, firstId));
      }
    }
  });
});
