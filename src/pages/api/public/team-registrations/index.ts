import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations, seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { createDepositIntentWithSavedCard } from "@/lib/stripe/saved-cards";
import { stripe } from "@/lib/stripe/client";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { isRegistrationClosed } from "@/lib/programs/registration-window";
import { seasonTeamCapReached, TEAM_CAP_MESSAGE } from "@/lib/registrations/team-capacity";
import { effectiveTeamPriceCents } from "@/lib/programs/early-bird";
import { CAPTAIN_DEPOSIT_CENTS } from "@/lib/registrations/team-deposit";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { createSession } from "@/lib/auth";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

const BodySchema = z.object({
  seasonId: z.string().uuid(),
  teamName: z.string().trim().min(1).max(200),
  captainName: z.string().trim().min(1).max(200),
  captainEmail: z.string().trim().toLowerCase().email().max(320),
  notes: z.string().trim().max(2000).optional(),
  // The UI can't submit without checking this — captain affirms the saved
  // card may be charged (off-session) for unpaid teammate shares after the
  // payment deadline. Recorded onto the row for every path (authed too).
  backstopConsent: z.literal(true),
});

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Split a single "captain name" field into first/last for upsertGuestUser.
 * Single-word names go entirely to firstName; users.lastName is nullable
 * but upsertGuestUser's type wants a string, so we pass "" rather than null.
 */
function splitCaptainName(name: string): { firstName: string; lastName: string } {
  const trimmed = name.trim();
  const idx = trimmed.lastIndexOf(" ");
  if (idx === -1) {
    return { firstName: trimmed, lastName: "" };
  }
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1) };
}

/**
 * Create a team registration. The captain provides their identity + the
 * season + a team name; we return an invite token and a shareable URL.
 *
 * v1: this only creates the team grouping. The captain still needs to go
 * through the existing per-player registration flow at /register/[seasonId];
 * teammates do the same after clicking the invite URL.
 */
export const POST: APIRoute = async (context) => {
  const { request, locals, clientAddress } = context;
  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const org = locals.organization;
  if (!org) {
    return new Response(
      JSON.stringify({ error: "Organization context required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // This endpoint now accepts anonymous callers (guest captains), which
  // makes it an unauthenticated write surface — upserts a user and, for
  // authed Stripe environments, creates a Stripe customer + PaymentIntent.
  // 5/min/IP, before any DB work, mirroring guest-checkout.ts.
  const ip = clientAddress || "unknown";
  const ipLimit = rateLimit(`team-create:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) {
    return rateLimitedResponse(ipLimit.retryAfter ?? 60);
  }

  let parsed;
  try {
    const body = await request.json();
    parsed = BodySchema.safeParse(body);
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid JSON body" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.issues }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { seasonId, teamName, captainName, captainEmail, notes } = parsed.data;

  let captainUserId: string;
  let wasNewUser = false;

  if (locals.user) {
    captainUserId = locals.user.id;
  } else {
    // Anonymous captain path. Upsert-by-email is the single source of truth
    // for "does this email already have an account" — using its result
    // (rather than a separate SELECT beforehand) avoids a check-then-act
    // race with a concurrent signup/registration for the same email.
    let upserted;
    try {
      const { firstName, lastName } = splitCaptainName(captainName);
      upserted = await upsertGuestUser(db, {
        email: captainEmail,
        firstName,
        lastName,
      });
    } catch (err) {
      console.error("[team-registrations] guest upsert failed", err);
      return new Response(
        JSON.stringify({ error: "Could not create team" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!upserted.wasNewUser) {
      // Account-takeover prevention: never attach a team or mint a session
      // for an email that already has an account. The client falls back to
      // its existing requestMagicLink flow to let the real owner sign in.
      return new Response(
        JSON.stringify({
          error: "account_exists",
          message:
            "We emailed you a link to continue — this email already has an account.",
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    captainUserId = upserted.userRow.id;
    wasNewUser = true;
    await createSession(captainUserId, context);
  }

  let teamRegistrationId: string | undefined;

  try {
    // Verify the season exists and belongs to this org, and snapshot the
    // team fee + payment deadline onto the row at creation time.
    const seasonRow = await db
      .select({
        id: seasons.id,
        teamPriceCents: seasons.teamPriceCents,
        priceCents: seasons.priceCents,
        earlyBirdDeadline: seasons.earlyBirdDeadline,
        earlyBirdTeamPriceCents: seasons.earlyBirdTeamPriceCents,
        registrationCloses: seasons.registrationCloses,
        startDate: seasons.startDate,
        maxTeams: seasons.maxTeams,
      })
      .from(seasons)
      .where(eq(seasons.id, seasonId))
      .limit(1);
    if (seasonRow.length === 0) {
      return new Response(
        JSON.stringify({ error: "Season not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    const season = seasonRow[0];

    // Same "live until" gate as createRegistration — a team can't be formed
    // for a season whose registration window has passed.
    if (isRegistrationClosed(season)) {
      return new Response(
        JSON.stringify({ error: "Registration for this season has closed" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const inviteToken = generateInviteToken();
    const brand = brandFromHost(request.headers.get("host") ?? "");

    // Team fee, early-bird aware. Snapshotted onto the row below, so the price
    // is locked in at team-creation time — a captain who forms the team inside
    // the window keeps the early-bird rate even if they pay after it closes.
    const listTeamFeeCents = season.teamPriceCents ?? season.priceCents;
    const teamFeeCents = effectiveTeamPriceCents(season, listTeamFeeCents);

    // Team cap (#429): count + insert inside one transaction with the season
    // row locked, so two captains racing for the last slot serialize — the
    // same lock-first pattern as the walk-in capacity gate.
    const capResult = await db.transaction(
      async (tx): Promise<{ kind: "created"; id: string } | { kind: "cap_full" }> => {
        await tx
          .select({ id: seasons.id })
          .from(seasons)
          .where(eq(seasons.id, seasonId))
          .for("update");
        if (await seasonTeamCapReached(tx, seasonId, season.maxTeams)) {
          return { kind: "cap_full" };
        }
        const inserted = await tx
          .insert(teamRegistrations)
          .values({
            organizationId: org.id,
            seasonId,
            captainUserId,
            captainEmail,
            captainName,
            teamName,
            inviteToken,
            notes,
            status: "forming",
            brand,
            teamFeeCents,
            depositCents: CAPTAIN_DEPOSIT_CENTS,
            paymentDeadline: season.registrationCloses,
            backstopConsentedAt: new Date(),
          })
          .returning({ id: teamRegistrations.id });
        const id = inserted[0]?.id;
        if (!id) throw new Error("team_registrations insert returned no id");
        return { kind: "created", id };
      },
    );
    if (capResult.kind === "cap_full") {
      return new Response(JSON.stringify({ error: TEAM_CAP_MESSAGE }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      });
    }

    teamRegistrationId = capResult.id;
    const phSessionId = request.headers.get("X-PostHog-Session-Id") || undefined;
    return await finishWithDepositIntent({
      teamRegistrationId,
      captainUserId,
      captainEmail,
      inviteToken,
      teamFeeCents,
      wasNewUser,
      attributionMetadata: {
        brand,
        ...collectAdAttribution(context.url, request.headers.get("cookie")),
        ...(phSessionId ? { ph_session_id: phSessionId } : {}),
      },
    });
  } catch (err) {
    console.error("[team-registrations] insert failed", err);
    return new Response(
      JSON.stringify({ error: "Could not create team" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};

/**
 * Create the captain's $200 deposit PaymentIntent (which also saves the card
 * off-session for the backstop charge) and persist the Stripe customer id onto
 * the team row. A Stripe failure rolls back the half-created team and returns a
 * clean 502 so the client never gets an unpayable team.
 */
async function finishWithDepositIntent(params: {
  teamRegistrationId: string;
  captainUserId: string;
  captainEmail: string;
  inviteToken: string;
  teamFeeCents: number;
  wasNewUser: boolean;
  /** brand + ad/PostHog attribution riders to stamp on the deposit intent. */
  attributionMetadata: Record<string, string>;
}): Promise<Response> {
  const { teamRegistrationId, captainUserId, captainEmail, inviteToken, teamFeeCents, wasNewUser, attributionMetadata } =
    params;
  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  // Graceful degradation: with no Stripe configured (local dev / CI), create the
  // team WITHOUT a deposit so the rest of the flow still works. Production has
  // Stripe, so the $200 deposit + saved card are enforced there. The team-create
  // UI already falls through to the share view when no client secret is returned.
  if (!stripe) {
    return new Response(
      JSON.stringify({
        ok: true,
        teamRegistrationId,
        inviteToken,
        joinUrl: `/team/${inviteToken}`,
        teamFeeCents,
        depositClientSecret: null,
        publishableKey: null,
        wasNewUser,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }

  let clientSecret: string;
  let customerId: string;
  try {
    const intent = await createDepositIntentWithSavedCard({
      userId: captainUserId,
      email: captainEmail,
      amountCents: CAPTAIN_DEPOSIT_CENTS,
      metadata: {
        team_registration_id: teamRegistrationId,
        kind: "team_deposit",
        // brand + attribution riders, read back by
        // handle-team-deposit-succeeded so the deposit's analytics join the
        // captain's browser session/person.
        ...attributionMetadata,
      },
    });
    clientSecret = intent.clientSecret;
    customerId = intent.customerId;
  } catch (err) {
    console.error("[team-registrations] deposit intent failed", err);
    // Don't leave a half-created team claiming success — remove the row so the
    // captain can retry cleanly. (No registrations reference it yet.)
    try {
      await db
        .delete(teamRegistrations)
        .where(eq(teamRegistrations.id, teamRegistrationId));
    } catch (cleanupErr) {
      console.error("[team-registrations] rollback delete failed", cleanupErr);
    }
    return new Response(
      JSON.stringify({
        error:
          "We couldn't start your deposit. Please try again in a moment — no team was created.",
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  await db
    .update(teamRegistrations)
    .set({ captainStripeCustomerId: customerId, updatedAt: new Date() })
    .where(eq(teamRegistrations.id, teamRegistrationId));

  return new Response(
    JSON.stringify({
      ok: true,
      teamRegistrationId,
      inviteToken,
      joinUrl: `/team/${inviteToken}`,
      teamFeeCents,
      depositClientSecret: clientSecret,
      publishableKey: import.meta.env.STRIPE_PUBLISHABLE_KEY,
      wasNewUser,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
