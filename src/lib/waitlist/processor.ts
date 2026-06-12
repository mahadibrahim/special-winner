import { getDb } from "@/lib/db";
import { registrations, familyMembers, seasons, programs, locations, users } from "@/lib/db/schema";
import { eq, and, asc, lt } from "drizzle-orm";
import { sendWaitlistPromotionEmail } from "@/lib/email/send";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";

// Waitlist promotion hours (how long they have to complete payment)
export const WAITLIST_PROMOTION_HOURS = 48;

/**
 * Process expired waitlist promotions
 * This should be called periodically (e.g., by a cron job)
 * Returns the number of registrations that were expired and replaced
 */
export async function processExpiredWaitlistPromotions(): Promise<number> {
  if (false) {
    console.warn("Database not available for waitlist processing");
    return 0;
  }

  try {
    const now = new Date();

    // Find registrations that were promoted from waitlist but expired
    const expiredPromotions = await getDb()
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.status, "pending"),
          lt(registrations.waitlistExpiresAt, now)
        )
      );

    let processedCount = 0;

    for (const expired of expiredPromotions) {
      // Return to waitlist
      await getDb()
        .update(registrations)
        .set({
          status: "waitlisted",
          waitlistPromotedAt: null,
          waitlistExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, expired.id));

      // Promote next in line
      const promoted = await promoteNextFromWaitlist(expired.seasonId);
      if (promoted) {
        processedCount++;
      }
    }

    return processedCount;
  } catch (error) {
    console.error("Error processing expired waitlist promotions:", error);
    return 0;
  }
}

/**
 * Promote the next registration from the waitlist for a given season
 */
export async function promoteNextFromWaitlist(seasonId: string): Promise<boolean> {
  if (false) {
    console.warn("Database not available for waitlist promotion");
    return false;
  }

  try {
    // Get season info
    const [season] = await getDb()
      .select()
      .from(seasons)
      .where(eq(seasons.id, seasonId));

    if (!season) {
      console.warn(`Season ${seasonId} not found for waitlist promotion`);
      return false;
    }

    // Get first waitlisted registration (include brand for email branding)
    const [waitlisted] = await getDb()
      .select({
        registration: registrations,
        familyMember: familyMembers,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .where(
        and(
          eq(registrations.seasonId, seasonId),
          eq(registrations.status, "waitlisted")
        )
      )
      .orderBy(asc(registrations.waitlistPosition), asc(registrations.createdAt))
      .limit(1);

    if (!waitlisted) {
      // No one on waitlist
      return false;
    }

    // Set expiration time
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + WAITLIST_PROMOTION_HOURS);

    // Update to pending status
    await getDb()
      .update(registrations)
      .set({
        status: "pending",
        waitlistPromotedAt: new Date(),
        waitlistExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, waitlisted.registration.id));

    // Get program and location info for email
    const [programData] = await getDb()
      .select({
        program: programs,
        location: locations,
      })
      .from(programs)
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(programs.id, season.programId));

    // Get parent user info
    const [parentUser] = await getDb()
      .select()
      .from(users)
      .where(eq(users.id, waitlisted.registration.registeredByUserId));

    if (programData && parentUser) {
      const brand = normalizeBrand(waitlisted.registration.brand);
      // Send waitlist promotion email
      sendWaitlistPromotionEmail({
        userId: parentUser.id,
        organizationId: programData.location.organizationId,
        registrationId: waitlisted.registration.id,
        parentEmail: parentUser.email,
        parentName: parentUser.firstName || parentUser.email.split("@")[0],
        childName: `${waitlisted.familyMember.firstName} ${waitlisted.familyMember.lastName}`,
        programName: programData.program.name,
        seasonName: season.name,
        amountDueCents: waitlisted.registration.amountDueCents,
        expiresAt,
        hoursToComplete: WAITLIST_PROMOTION_HOURS,
        brand,
      }).catch((err) => console.error("Error sending waitlist promotion email:", err));
    }

    console.log(`Promoted registration ${waitlisted.registration.id} from waitlist for season ${seasonId}`);
    return true;
  } catch (error) {
    console.error("Error promoting from waitlist:", error);
    return false;
  }
}

/**
 * Get current waitlist position for a registration
 */
export async function getWaitlistPosition(registrationId: string): Promise<number | null> {
  if (false) return null;

  try {
    const [registration] = await getDb()
      .select()
      .from(registrations)
      .where(eq(registrations.id, registrationId));

    if (!registration || registration.status !== "waitlisted") {
      return null;
    }

    // Count how many waitlisted registrations are ahead
    const waitlisted = await getDb()
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, registration.seasonId),
          eq(registrations.status, "waitlisted")
        )
      )
      .orderBy(asc(registrations.waitlistPosition), asc(registrations.createdAt));

    const position = waitlisted.findIndex((r) => r.id === registrationId);
    return position >= 0 ? position + 1 : null;
  } catch (error) {
    console.error("Error getting waitlist position:", error);
    return null;
  }
}

/**
 * Update waitlist positions after a cancellation
 * This reorders all waitlisted registrations for a season
 */
export async function reorderWaitlist(seasonId: string): Promise<void> {
  if (false) return;

  try {
    const waitlisted = await getDb()
      .select()
      .from(registrations)
      .where(
        and(
          eq(registrations.seasonId, seasonId),
          eq(registrations.status, "waitlisted")
        )
      )
      .orderBy(asc(registrations.waitlistPosition), asc(registrations.createdAt));

    // Update positions
    for (let i = 0; i < waitlisted.length; i++) {
      await getDb()
        .update(registrations)
        .set({ waitlistPosition: i + 1 })
        .where(eq(registrations.id, waitlisted[i].id));
    }
  } catch (error) {
    console.error("Error reordering waitlist:", error);
  }
}
