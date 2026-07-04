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

const DEPOSIT_AMOUNT_CENTS = 20000; // $200 (locked decision)

const BodySchema = z.object({
  seasonId: z.string().uuid(),
  teamName: z.string().trim().min(1).max(200),
  captainName: z.string().trim().min(1).max(200),
  captainEmail: z.string().trim().toLowerCase().email().max(320),
  notes: z.string().trim().max(2000).optional(),
});

function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Create a team registration. The captain provides their identity + the
 * season + a team name; we return an invite token and a shareable URL.
 *
 * v1: this only creates the team grouping. The captain still needs to go
 * through the existing per-player registration flow at /register/[seasonId];
 * teammates do the same after clicking the invite URL.
 */
export const POST: APIRoute = async ({ request, locals }) => {
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

  // The captain pays a $200 deposit that SAVES a card (off-session) for the
  // backstop charge, so we need a Stripe customer tied to a real user.
  if (!locals.user) {
    return new Response(
      JSON.stringify({ error: "Please sign in to reserve a team." }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
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

  const captainUserId = locals.user.id;
  let teamRegistrationId: string | undefined;

  try {
    // Verify the season exists and belongs to this org, and snapshot the
    // team fee + payment deadline onto the row at creation time.
    const seasonRow = await db
      .select({
        id: seasons.id,
        teamPriceCents: seasons.teamPriceCents,
        priceCents: seasons.priceCents,
        registrationCloses: seasons.registrationCloses,
        startDate: seasons.startDate,
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

    const inserted = await db
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
        teamFeeCents: season.teamPriceCents ?? season.priceCents,
        depositCents: DEPOSIT_AMOUNT_CENTS,
        paymentDeadline: season.registrationCloses,
      })
      .returning({ id: teamRegistrations.id });

    teamRegistrationId = inserted[0]?.id;
    if (!teamRegistrationId) {
      throw new Error("team_registrations insert returned no id");
    }
    return await finishWithDepositIntent({
      teamRegistrationId,
      captainUserId,
      captainEmail,
      inviteToken,
      teamFeeCents: season.teamPriceCents ?? season.priceCents,
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
}): Promise<Response> {
  const { teamRegistrationId, captainUserId, captainEmail, inviteToken, teamFeeCents } =
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
      amountCents: DEPOSIT_AMOUNT_CENTS,
      metadata: {
        team_registration_id: teamRegistrationId,
        kind: "team_deposit",
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
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
