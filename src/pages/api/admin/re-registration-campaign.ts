import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { sendToParent } from "@/lib/messaging/gateway";

/**
 * POST /api/admin/re-registration-campaign
 *
 * Registration Path 2 — returning family magic-link path.
 *
 * For a given new season, find every family that registered in a past
 * season of the same program and send them a magic link to re-register.
 * The magic link (purpose: 'register_for_season') auto-authenticates
 * them into a pre-filled registration form — the 30-second flow.
 *
 * Body:
 *   - seasonId: string — the NEW season to re-register families into
 *   - dryRun?: boolean — if true, return the list of who would be contacted
 *     without actually sending anything (recommended before a real send)
 *
 * Returns: { contacted: number, skipped: number, dryRun?: Array<...> }
 */

const campaignSchema = z.object({
  seasonId: z.string().uuid(),
  dryRun: z.boolean().optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = campaignSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = getDb();

  // Load the new season — and require it belongs to caller's organization
  const [newSeasonInfo] = await db
    .select({
      season: seasons,
      program: programs,
      location: locations,
    })
    .from(seasons)
    .innerJoin(programs, eq(programs.id, seasons.programId))
    .innerJoin(locations, eq(locations.id, programs.locationId))
    .where(
      and(
        eq(seasons.id, parsed.data.seasonId),
        eq(locations.organizationId, orgContext.organizationId),
      ),
    )
    .limit(1);

  if (!newSeasonInfo) {
    return json({ error: "Season not found" }, 404);
  }

  const { program: newProgram, location: newLocation } = newSeasonInfo;

  // Find all past seasons of this program
  const pastSeasons = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(
      and(eq(seasons.programId, newProgram.id), ne(seasons.id, parsed.data.seasonId)),
    );

  if (pastSeasons.length === 0) {
    return json({
      contacted: 0,
      skipped: 0,
      message: "No past seasons for this program — no returning families to contact.",
    });
  }

  // Find unique parents who had a confirmed registration in any past season
  // of this program. Reach through registrations → family_members → parent user.
  const candidates = await db
    .selectDistinct({
      parentUserId: familyMembers.parentUserId,
      parentEmail: users.email,
      parentFirstName: users.firstName,
      kidId: familyMembers.id,
      kidFirstName: familyMembers.firstName,
    })
    .from(registrations)
    .innerJoin(familyMembers, eq(familyMembers.id, registrations.familyMemberId))
    .innerJoin(users, eq(users.id, familyMembers.parentUserId))
    .where(
      and(
        eq(registrations.status, "confirmed"),
        // Limit to past seasons of this program
        ...pastSeasons.map((s) => eq(registrations.seasonId, s.id)),
      ),
    );

  // The innerJoin on users guarantees parent_user_id is non-null, but Drizzle's
  // types don't model that. Narrow explicitly so the loop doesn't need !.
  const validCandidates = candidates.filter(
    (c): c is typeof c & { parentUserId: string } => c.parentUserId !== null,
  );

  const dryRunList: Array<{
    parentName: string | null;
    parentEmail: string;
    kidName: string;
  }> = [];

  let contacted = 0;
  let skipped = 0;

  if (parsed.data.dryRun) {
    for (const candidate of validCandidates) {
      dryRunList.push({
        parentName: candidate.parentFirstName,
        parentEmail: candidate.parentEmail,
        kidName: candidate.kidFirstName,
      });
    }
  } else {
    // Send in small parallel batches — each candidate is a magic-link
    // insert plus an SMS/email round trip, and serializing them made big
    // campaigns take minutes (and risk the function timeout). Neither
    // path opens a DB transaction, so overlapping is safe with the
    // max:1 pool; the batch size keeps provider rate limits comfortable.
    const SEND_BATCH = 5;
    const processCandidate = async (candidate: (typeof validCandidates)[number]) => {
      // Create a magic link scoped to this parent and the new season
      const { token } = await createMagicLink({
        userId: candidate.parentUserId,
        organizationId: newLocation.organizationId,
        purpose: "register_for_season",
        purposeContext: {
          seasonId: parsed.data.seasonId,
          kidId: candidate.kidId,
        },
        deliveredChannel: "sms",
      });

      const magicUrl = buildMagicLinkUrl(token);

      const body = `${newProgram.name} registration is open! ${candidate.kidFirstName} can re-register in ~30 seconds — we'll pre-fill everything we know.\n\n${magicUrl}\n\nExpires in 72 hours.`;

      const sendResult = await sendToParent({
        parentUserId: candidate.parentUserId,
        organizationId: newLocation.organizationId,
        body,
        conversationId: undefined,
        senderType: "system",
      });

      if (!sendResult.ok) {
        console.warn(
          `Re-registration send failed for parent ${candidate.parentUserId}: ${sendResult.reason}`,
        );
      }
      return sendResult.ok;
    };

    for (let i = 0; i < validCandidates.length; i += SEND_BATCH) {
      const batch = validCandidates.slice(i, i + SEND_BATCH);
      const results = await Promise.allSettled(batch.map(processCandidate));
      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        if (r.status === "fulfilled" && r.value) {
          contacted++;
        } else {
          skipped++;
          if (r.status === "rejected") {
            console.error(
              `Re-registration error for parent ${batch[j].parentUserId}:`,
              r.reason,
            );
          }
        }
      }
    }
  }

  if (parsed.data.dryRun) {
    return json({
      dryRun: true,
      wouldContact: dryRunList.length,
      preview: dryRunList.slice(0, 20),
      previewTruncated: dryRunList.length > 20,
    });
  }

  return json({
    success: true,
    contacted,
    skipped,
    totalCandidates: candidates.length,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
