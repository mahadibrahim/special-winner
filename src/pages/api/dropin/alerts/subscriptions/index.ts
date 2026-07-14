import type { APIRoute } from "astro";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pickupAlertSubscriptions } from "@/lib/db/schema/hosts";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { normalizeUsPhone } from "@/lib/sms/send";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function phoneReady(userId: string, organizationId: string): Promise<boolean> {
  const db = getDb();
  const [u] = await db
    .select({ phone: users.phone })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u?.phone) return false;
  // phone_opt_ins.phone is stored E.164 (see fill-alerts.ts / send.ts); raw
  // users.phone may not be — normalize before comparing or a differently
  // formatted-but-equivalent number silently fails this check.
  const normalizedPhone = normalizeUsPhone(u.phone);
  if (!normalizedPhone) return false;
  const [optIn] = await db
    .select({ status: phoneOptIns.status })
    .from(phoneOptIns)
    .where(
      and(
        eq(phoneOptIns.organizationId, organizationId),
        eq(phoneOptIns.phone, normalizedPhone),
      ),
    )
    .orderBy(asc(phoneOptIns.createdAt))
    .limit(1);
  return optIn?.status === "opted_in";
}

export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  const org = locals.organization;
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!org) return json({ error: "No organization context" }, 400);

  const rows = await getDb()
    .select({
      id: pickupAlertSubscriptions.id,
      venueId: pickupAlertSubscriptions.venueId,
      venueName: venues.name,
      sport: pickupAlertSubscriptions.sport,
      active: pickupAlertSubscriptions.active,
    })
    .from(pickupAlertSubscriptions)
    .leftJoin(venues, eq(venues.id, pickupAlertSubscriptions.venueId))
    .where(
      and(
        eq(pickupAlertSubscriptions.userId, user.id),
        eq(pickupAlertSubscriptions.organizationId, org.id),
        eq(pickupAlertSubscriptions.active, true),
      ),
    )
    .orderBy(asc(pickupAlertSubscriptions.createdAt));

  return json(
    { subscriptions: rows, phoneReady: await phoneReady(user.id, org.id) },
    200,
  );
};

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  const org = locals.organization;
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!org) return json({ error: "No organization context" }, 400);

  if (!(await phoneReady(user.id, org.id))) {
    return json(
      {
        error: "Add and verify a phone number first",
        code: "phone_required",
      },
      409,
    );
  }

  let body: { venueId?: string | null; sport?: string | null };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const venueId = body.venueId || null;
  const sport = body.sport?.trim().toLowerCase() || null;

  const db = getDb();
  // App-level uniqueness: reuse (and reactivate) an existing row for the
  // same combo — NULLs make a DB unique index impractical here.
  const existing = await db
    .select({ id: pickupAlertSubscriptions.id })
    .from(pickupAlertSubscriptions)
    .where(
      and(
        eq(pickupAlertSubscriptions.userId, user.id),
        eq(pickupAlertSubscriptions.organizationId, org.id),
        venueId
          ? eq(pickupAlertSubscriptions.venueId, venueId)
          : isNull(pickupAlertSubscriptions.venueId),
        sport
          ? eq(pickupAlertSubscriptions.sport, sport)
          : isNull(pickupAlertSubscriptions.sport),
      ),
    )
    .orderBy(asc(pickupAlertSubscriptions.createdAt))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pickupAlertSubscriptions)
      .set({ active: true, unsubscribedAt: null, updatedAt: new Date() })
      .where(eq(pickupAlertSubscriptions.id, existing[0].id));
    return json({ ok: true, id: existing[0].id }, 200);
  }

  const [row] = await db
    .insert(pickupAlertSubscriptions)
    .values({ userId: user.id, organizationId: org.id, venueId, sport })
    .returning({ id: pickupAlertSubscriptions.id });
  return json({ ok: true, id: row.id }, 200);
};
