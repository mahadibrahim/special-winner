/**
 * POST /api/admin/classes/credits/grant
 *
 * Admin-issued comp (goodwill) class credits — owner decision 3 of the
 * waiver-ladder-followups plan. Inserts a `class_credit_grants` row with
 * `source: 'comp'`: no Stripe Checkout Session (the partial unique index on
 * `stripe_checkout_session_id` only covers non-NULL rows, so comp grants get
 * no dedupe from it — each POST is a fresh grant, same as clicking "Issue
 * credits" twice on purpose), `pricePaidCents: 0`, and `grantedByUserId` set
 * to the issuing admin. Comp credits float exactly like pack credits
 * (`slotTemplateId: null`) — nothing in the redemption path
 * (src/lib/classes/credits.ts, book-child.ts) filters by `source`, so they
 * spend on any class session like a pack credit does.
 *
 * Tenant-scoped the same way GET /api/admin/person/[id] pins a family
 * member to the caller's org: resolve the child's linked user
 * (parentUserId ?? selfUserId) and confirm that user is visible within the
 * admin's effective location scope. A family member that doesn't resolve —
 * wrong org, or no such row — 404s rather than leaking existence.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants, familyMembers, locations } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { isUserInOrg } from "@/lib/person/build-person-profile";
import { sendOpsPing } from "@/lib/ops/ping";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const grantInputSchema = z.object({
  familyMemberId: z.string().uuid(),
  sessions: z.number().int().min(1).max(50),
  // Bounded to a sane window: 0 would expire the grant on arrival, and an
  // unbounded value invites a fat-fingered multi-year grant. 3650 (10y) is
  // generous headroom above the longest real product (pack expiryMonths
  // caps well under a year) without being a de-facto "forever" credit.
  expiresInDays: z.number().int().min(1).max(3650).optional().default(90),
  note: z.string().trim().max(500).optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = grantInputSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  }
  const input = parsed.data;

  const db = getDb();

  // ---- Org-pinned child lookup (mirrors GET /api/admin/person/[id]) -------
  const [fm] = await db
    .select({
      id: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
      parentUserId: familyMembers.parentUserId,
      selfUserId: familyMembers.selfUserId,
    })
    .from(familyMembers)
    .where(eq(familyMembers.id, input.familyMemberId));

  const linkedUserId = fm ? (fm.parentUserId ?? fm.selfUserId) : null;
  if (!fm || !linkedUserId) {
    return json({ error: "Not found" }, 404);
  }

  const effectiveIds = await getEffectiveLocationIds({
    userId: auth.user.id,
    userRoles: auth.roles,
    activeLocationId: context.locals.activeLocationId,
  });
  let allowedLocationIds: string[];
  if (effectiveIds === null) {
    const orgLocations = await db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.organizationId, auth.organizationId));
    allowedLocationIds = orgLocations.map((l) => l.id);
  } else {
    allowedLocationIds = effectiveIds;
  }

  const inOrg = await isUserInOrg(linkedUserId, auth.organizationId, allowedLocationIds);
  if (!inOrg) {
    return json({ error: "Not found" }, 404);
  }

  // ---- Insert the grant -----------------------------------------------------
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);

  const [grant] = await db
    .insert(classCreditGrants)
    .values({
      organizationId: auth.organizationId,
      familyMemberId: fm.id,
      source: "comp",
      packProductId: null,
      blockId: null,
      slotTemplateId: null, // floating, like a pack credit
      sessionsGranted: input.sessions,
      pricePaidCents: 0,
      expiresAt,
      stripeCheckoutSessionId: null,
      grantedByUserId: auth.user.id,
    })
    .returning();

  // ---- Ops ping — reuse `class_pack_purchased` rather than adding a new
  // enum kind: a comp grant is materially the same event (a credit grant
  // just landed on a child's ledger) with amountCents: 0. The note (if any)
  // has nowhere else to live — classCreditGrants carries no note column —
  // so it's folded into the ping label here.
  const childName = `${fm.firstName} ${fm.lastName}`;
  const noteSuffix = input.note ? ` — "${input.note}"` : "";
  await sendOpsPing(auth.organizationId, {
    kind: "class_pack_purchased",
    brand: context.locals.brandId,
    eventId: grant.id,
    label: `Comp credit · ${childName} (${input.sessions} classes, by ${auth.user.email})${noteSuffix}`,
    amountCents: 0,
  });

  return json({ grant }, 201);
};
