/**
 * POST /api/rentals/claim/:token
 *
 * A guest field-rental booking (`renterUserId` null) has no dashboard to
 * land on once it's approved/priced — the approval and $0/comp confirmation
 * emails link here instead (see `mintRentalClaimToken` in
 * `@/lib/rentals/claim`). Visiting this endpoint with the right token either
 * creates a fresh account or signs an existing one in, attaches the pending
 * rental to that user, and starts a session.
 *
 * Body: { mode: "signup" | "signin", password: string, name?: string }
 *
 * Security ordering (do not reorder):
 *   1. Rate-limit by IP.
 *   2. Verify the token (kind `rental_claim`, unconsumed, unexpired).
 *   3. Load the rental; reject if already claimed or missing an email —
 *      BEFORE touching `users` or `sessions` at all.
 *   4. Only then read/create the user.
 *   5. Only after `claimRentalForUser` actually flips the row (it's a
 *      conditional UPDATE — see `@/lib/rentals/claim`) do we consume the
 *      token and mint a session. A race that loses the claim gets a 409
 *      and neither the token nor a session.
 *
 * The account's email is ALWAYS `rental.renterEmail` — the token proves
 * ownership of that specific address, so we trust it (`emailVerified:
 * true`) and never take an email from the request body. Signup against an
 * email that already has an account never silently attaches the rental —
 * it 409s with `account_exists` so the UI can switch to the sign-in form.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { verifyToken, consumeToken } from "@/lib/check-in/tokens-db";
import { hashPassword, verifyPassword, createSession } from "@/lib/auth";
import { normalizeForUniqueness } from "@/lib/auth/email-normalize";
import { claimRentalForUser } from "@/lib/rentals/claim";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

// Postgres SQLSTATE, sometimes nested under `.cause` depending on the driver
// layer that rethrew (mirrors the admin CRUD endpoints' helper).
function getDbErrorCode(error: unknown): string | undefined {
  const e = error as { code?: string; cause?: { code?: string } } | null;
  return e?.code ?? e?.cause?.code;
}

export const POST: APIRoute = async (ctx) => {
  const { params, request, clientAddress } = ctx;
  const ip = clientAddress || "unknown";

  // Unauthenticated write endpoint that creates accounts — per-IP burst
  // limit first, before any DB work.
  const rl = rateLimit(`rental-claim:ip:${ip}`, 10, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfter ?? 60);

  const token = params.token ?? "";
  const v = await verifyToken(token);
  if (!v.ok) {
    const status = v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;
  if (tok.kind !== "rental_claim") return json({ error: "not_found" }, 404);

  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, tok.targetId))
    .limit(1);
  if (!rental) return json({ error: "rental_not_found" }, 404);
  // Check BEFORE any user/session work — no point creating an account for
  // a rental that's already spoken for (or racing a concurrent claim).
  if (rental.renterUserId) return json({ error: "already_claimed" }, 409);
  if (!rental.renterEmail) return json({ error: "no_email_on_rental" }, 422);

  let body: { mode?: string; password?: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const mode = body.mode === "signin" ? "signin" : "signup";
  const password = body.password ?? "";
  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters" }, 422);
  }

  // Email always comes from the rental, never the request body — the
  // claim token is the proof of ownership over this exact address.
  const emailCanonical = normalizeForUniqueness(rental.renterEmail);
  const existing = await db.query.users.findFirst({
    where: eq(users.emailCanonical, emailCanonical),
  });

  let userId: string;
  if (mode === "signin") {
    if (
      !existing ||
      !existing.passwordHash ||
      !(await verifyPassword(password, existing.passwordHash))
    ) {
      return json({ error: "Wrong email or password" }, 401);
    }
    userId = existing.id;
  } else {
    // Signup mode: never silently attach to (or overwrite) an existing
    // account. Tell the UI to switch to the sign-in variant instead.
    if (existing) return json({ error: "account_exists" }, 409);

    const rawName = (body.name ?? rental.renterName ?? "").trim();
    const [first, ...rest] = rawName.split(/\s+/).filter(Boolean);
    try {
      const [u] = await db
        .insert(users)
        .values({
          email: rental.renterEmail.toLowerCase(),
          emailCanonical,
          passwordHash: await hashPassword(password),
          firstName: first || rental.renterName,
          lastName: rest.join(" ") || null,
          phone: rental.renterPhone,
          // Justified ONLY because the claim token proves ownership of this
          // address (it was minted against rental.renterEmail and delivered
          // to it) — never set this for a body-supplied email.
          emailVerified: true,
        })
        .returning();
      userId = u.id;
    } catch (err) {
      // Two concurrent signups for the same email both clear the `existing`
      // lookup above; the second loses the race on the users unique index
      // (email / email_canonical). Surface the same account_exists 409 the
      // found-existing branch returns rather than an ungraceful 500.
      if (getDbErrorCode(err) === "23505") {
        return json({ error: "account_exists" }, 409);
      }
      throw err;
    }
  }

  // Conditional UPDATE — false means someone else claimed it between our
  // read above and now (raced approval emails, double-submit, etc).
  const claimed = await claimRentalForUser(rental.id, userId);
  if (!claimed) return json({ error: "already_claimed" }, 409);

  // Only after a successful claim: consume the token (one-time use) and
  // start the session.
  await consumeToken(tok.id, ip);
  await createSession(userId, ctx);

  return json({ ok: true, redirect: "/dashboard/bookings" }, 200);
};
