import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { hashPassword } from "@/lib/auth/password";

export async function createTestHost(opts: {
  organizationId: string;
  preferredVenueId?: string | null;
  status?: "active" | "paused" | "revoked";
}) {
  const db = getDb();
  const email = `host-${Date.now()}-${Math.random().toString(36).slice(2)}@t.example`;
  const [u] = await db
    .insert(users)
    .values({ email, firstName: "Test", lastName: "Host" })
    .returning();
  const [profile] = await db
    .insert(hostProfiles)
    .values({
      userId: u.id,
      organizationId: opts.organizationId,
      status: opts.status ?? "active",
      preferredVenueId: opts.preferredVenueId ?? null,
      bio: "Test host bio",
    })
    .returning();
  return { userId: u.id, profileId: profile.id, email };
}

/**
 * Same as createTestHost, but with a real password hash + emailVerified so
 * the fixture can sign in over HTTP via getAuthCookie. createTestHost's
 * users row has no password and can't authenticate.
 */
export async function createTestHostWithPassword(opts: {
  organizationId: string;
  preferredVenueId?: string | null;
  status?: "active" | "paused" | "revoked";
}) {
  const db = getDb();
  const email = `host-${Date.now()}-${Math.random().toString(36).slice(2)}@t.example`;
  const password = "TestHost123!";
  const [u] = await db
    .insert(users)
    .values({
      email,
      firstName: "Test",
      lastName: "Host",
      passwordHash: await hashPassword(password),
      emailVerified: true,
    })
    .returning();
  const [profile] = await db
    .insert(hostProfiles)
    .values({
      userId: u.id,
      organizationId: opts.organizationId,
      status: opts.status ?? "active",
      preferredVenueId: opts.preferredVenueId ?? null,
      bio: "Test host bio",
    })
    .returning();
  return { userId: u.id, profileId: profile.id, email, password };
}

/**
 * Plain (non-host) user with a real password hash, for endpoints that only
 * need `locals.user` — no host_profiles row. Same auth shape as
 * createTestHostWithPassword minus the profile, with an optional `phone`
 * so callers can exercise phone-gated flows (e.g. pickup alert
 * subscriptions) without a separate update.
 */
export async function createTestUserWithPassword(opts: { phone?: string } = {}) {
  const db = getDb();
  const email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@t.example`;
  const password = "TestUser123!";
  const [u] = await db
    .insert(users)
    .values({
      email,
      firstName: "Test",
      lastName: "User",
      passwordHash: await hashPassword(password),
      emailVerified: true,
      phone: opts.phone ?? null,
    })
    .returning();
  return { userId: u.id, email, password };
}
