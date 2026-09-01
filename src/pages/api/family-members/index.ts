import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema";
import { eq, or, asc } from "drizzle-orm";
import { z } from "zod";
import { getPostHogServer } from "@/lib/posthog-server";
import { recordConsent } from "@/lib/consents/record";
import { hasValidLiabilityWaiverBatch } from "@/lib/consents/liability";
import { resolvePerson } from "@/lib/registrations/resolve-person";

/**
 * Cap on the annual-waiver probe below. This endpoint returns EVERY person the
 * caller owns — unbounded, unlike /api/classes/summary's own MAX_CHILDREN-capped
 * list. Real families are small; long-lived test/staff accounts are not (the
 * shared `parent@test.aspiresports.com` fixture has accumulated ~1,800 rows
 * across the suite's history).
 *
 * The probe is now `hasValidLiabilityWaiverBatch` — three set-based queries no
 * matter how many people are in it, where it used to be a serial per-person
 * fan-out that the old cap of 25 existed to bound. What the cap bounds now is
 * only the size of the `IN` lists, so it is raised to 200: past that a single
 * account is not a family and the flag is not worth the planner time.
 *
 * The cap takes the NEWEST rows, not the oldest — the same correction
 * /api/classes/summary documents for its own cap. The list itself is ordered
 * oldest-first for display, but an oldest-first CAP would drop exactly the
 * child a parent just added, i.e. the one most likely to be booked next.
 *
 * Beyond the cap — and on any probe failure — the flag is `false`, which is the
 * SAFE default: false means "show the waiver panel", so the worst case is
 * asking a covered family to sign again, never booking one with no release on
 * record.
 */
const WAIVER_PROBE_LIMIT = 200;

const createFamilyMemberSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)"),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
  medicalNotes: z.string().optional(),
  emergencyContactName: z.string().max(200).optional(),
  emergencyContactPhone: z.string().max(20).optional(),
  // COPPA: separate, affirmative parental consent for THIS child. Account-
  // level ToS does not satisfy verifiable parental consent.
  parentalConsent: z.boolean().refine((v) => v === true, {
    message:
      "Parental consent is required to add a child. Please confirm you are the parent or legal guardian.",
  }),
});

/**
 * GET - List family members for current user.
 *
 * `?includeWaiver=1` additionally resolves `waiverOnFile` per person — the
 * canonical ANNUAL liability predicate (src/lib/consents/liability.ts) scoped
 * to the resolved organization. It is OPT-IN because it costs one indexed
 * lookup per person and only the class booking modals need it: they use the
 * flag to skip the guardian-waiver panel for a child who is already covered,
 * instead of asking every family to re-sign at the paid door. Callers that
 * don't ask (the registration wizard, the dashboard) pay nothing and see an
 * unchanged payload.
 *
 * Without an organization context (an unmapped host) the flag is `false` for
 * everyone — waivers are per-organization legal releases, so there is no
 * honest org-agnostic answer, and `false` errs toward asking.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const rows = await db
      .select()
      .from(familyMembers)
      .where(
        or(
          eq(familyMembers.parentUserId, user.id),
          eq(familyMembers.selfUserId, user.id),
        ),
      )
      .orderBy(asc(familyMembers.createdAt));

    const organizationId = locals.organization?.id ?? null;
    const wantsWaiver =
      url.searchParams.get("includeWaiver") === "1" && organizationId !== null;
    let waiverOnFileById = new Map<string, boolean>();
    if (wantsWaiver) {
      try {
        waiverOnFileById = await hasValidLiabilityWaiverBatch(
          rows.slice(-WAIVER_PROBE_LIMIT).map((r) => r.id),
          organizationId!,
          db,
        );
      } catch (err) {
        // Fail toward ASKING, never toward a silent 500 on a list endpoint the
        // dashboard also uses without the flag: an empty map reads as `false`
        // for everyone, i.e. every booking door shows its waiver panel.
        console.error("[family-members] waiver probe failed", err);
      }
    }

    const members = rows.map((r) => ({
      ...r,
      kind: r.selfUserId ? "self" : "dependent",
      ...(wantsWaiver ? { waiverOnFile: waiverOnFileById.get(r.id) ?? false } : {}),
    }));

    return new Response(JSON.stringify({ familyMembers: members }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching family members:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// POST - Create new family member
export const POST: APIRoute = async ({ request, clientAddress, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    const body = await request.json();
    const validation = createFamilyMemberSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const data = validation.data;
    const userAgent = request.headers.get("user-agent");

    // Find-or-create the dependent via the shared helper — dedupes on
    // (parentUserId, name, birthDate) and avoids the self/parent XOR
    // constraint race. Extra profile fields are applied afterward so a
    // re-add refreshes them on the existing row.
    const person = await resolvePerson(db, {
      kind: "dependent",
      parentUserId: user.id,
      firstName: data.firstName,
      lastName: data.lastName,
      birthDate: data.birthDate,
    });

    const [newMember] = await db
      .update(familyMembers)
      .set({
        gender: data.gender ?? null,
        medicalNotes: data.medicalNotes || null,
        emergencyContactName: data.emergencyContactName || null,
        emergencyContactPhone: data.emergencyContactPhone || null,
        updatedAt: new Date(),
      })
      .where(eq(familyMembers.id, person.id))
      .returning();

    const signerName = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    await recordConsent({
      db,
      familyMemberId: newMember.id,
      type: "parental",
      signedByUserId: user.id,
      signedByName: signerName || user.email,
      ipAddress: clientAddress ?? null,
      userAgent: userAgent ?? null,
    });

    const posthog = getPostHogServer();
    posthog.capture({ distinctId: user.id, event: "family_member_added", properties: { family_member_id: newMember.id, has_gender: !!data.gender, has_medical_notes: !!data.medicalNotes, has_emergency_contact: !!data.emergencyContactName } });

    return new Response(JSON.stringify({ familyMember: newMember }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error creating family member:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
