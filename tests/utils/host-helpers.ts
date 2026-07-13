import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { hostProfiles } from "@/lib/db/schema/hosts";

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
