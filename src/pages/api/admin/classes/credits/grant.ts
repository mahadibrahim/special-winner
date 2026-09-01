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
 * (parentUserId) and confirm that user is visible within the admin's
 * effective location scope. A family member that doesn't resolve — wrong
 * org, no such row — 404s rather than leaking existence.
 *
 * CHILDREN ONLY: comp credits are consumed through the child booking path
 * (createChildClassBooking / POST /api/classes/book), which is keyed on
 * `familyMembers.parentUserId` — an adult self-registrant (`selfUserId`
 * set, `parentUserId` null) has no route to redeem a class-credit grant at
 * all, so minting one for a self row would be a dead, un-spendable credit.
 * Guarded below by requiring `parentUserId` before anything else.
 *
 * ORG-WIDE ADMINS ONLY: this endpoint MINTS value (a $0 grant a family can
 * spend), unlike the read endpoint it mirrors. Gated on
 * `requireOrgWideAdminAccess` rather than `requireOrgAdminAccess` — per-
 * location admins are deliberately excluded rather than trusted with the
 * READ endpoint's location-scoping chain: `isUserInOrg`'s
 * userOrganizationAccess fallback does not filter by location (a documented
 * Phase-2 gap — see location-scoped-admins-phase2-pending in project
 * memory), so a location-scoped admin routed through that same chain could
 * mint comp credits for a child at a DIFFERENT location in the org. Comps
 * are an org-level trust action; per-location admins get a flat 403 instead
 * of inheriting that gap.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classCreditGrants, familyMembers, locations } from "@/lib/db/schema";
import { requireOrgWideAdminAccess } from "@/lib/auth/roles";
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
  const auth = await requireOrgWideAdminAccess(context);
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
    })
    .from(familyMembers)
    .where(eq(familyMembers.id, input.familyMemberId));

  // Children only (parentUserId set) — see the CHILDREN ONLY note above.
  // An adult self-registrant (selfUserId set, parentUserId null) has no
  // redemption path for a class-credit grant, so this 404s the same as a
  // nonexistent/cross-org id rather than minting a dead credit.
  if (!fm || !fm.parentUserId) {
    return json({ error: "Not found" }, 404);
  }
  const linkedUserId = fm.parentUserId;

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
  //
  // Known cosmetic tradeoff (left as-is, not fixed): the rendered message
  // still reads "... Class pack — Comp credit · ..., $0.00" — the trailing
  // "$0.00" comes from formatOpsPingMessage's `"amountCents" in event`
  // check, and `class_pack_purchased`'s type requires amountCents (it's
  // not optional on that variant), so there's no way to omit it without
  // either a type change to the shared OpsPingEvent union or a new enum
  // kind — both bigger than this reuse is worth. The label leads with
  // "Comp credit" precisely so a reader isn't confused by the trailing
  // $0.00 into thinking a real pack sale happened.
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
