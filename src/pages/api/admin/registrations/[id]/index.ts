import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  users,
  locations,
  payments,
  paymentPlans,
} from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  teamFundedRegistrations,
  teamBlocksByRegistrationId,
} from "@/lib/registrations/team-funding";

/**
 * Admin detail view for a single registration. Returns the registration with
 * family member / season / program / sport / location / parent user, plus the
 * full payment history (most recent first).
 *
 * Tenant scoped: returns 404 if the row's program.location.organizationId does
 * not match the caller's org context — matches the list endpoint pattern.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Registration ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // The tenant-scoped row lookup and the payment history are independent
    // of each other at the query level (paymentHistory only filters on
    // `id`) — run in parallel, then apply the 404 gate after both resolve
    // and discard paymentHistory if the row turned out to be out of the
    // caller's org (no data leaks: it's never included in the 404 response).
    const [[row], paymentHistory] = await Promise.all([
      getDb()
        .select({
          registration: registrations,
          familyMember: familyMembers,
          season: seasons,
          program: programs,
          sport: sports,
          location: locations,
          parent: {
            id: users.id,
            email: users.email,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(registrations)
        .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .innerJoin(locations, eq(programs.locationId, locations.id))
        .innerJoin(users, eq(registrations.registeredByUserId, users.id))
        .where(
          and(
            eq(registrations.id, id),
            eq(locations.organizationId, orgContext.organizationId),
          ),
        ),

      getDb()
        .select()
        .from(payments)
        .where(eq(payments.registrationId, id))
        .orderBy(desc(payments.createdAt)),
    ]);

    if (!row) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Team financial context (#530): a team member's own row is $0/$0 when
    // the captain's deposit covers it, so the detail carries the team's
    // money state plus the team-level payment rows for context.
    const teamBlocks = await teamBlocksByRegistrationId(getDb(), [id]);
    const teamBlock = teamBlocks.get(id) ?? null;
    const team = teamBlock
      ? {
          ...teamBlock,
          payments: await getDb()
            .select()
            .from(payments)
            .where(eq(payments.teamRegistrationId, teamBlock.id))
            .orderBy(desc(payments.createdAt)),
        }
      : null;

    return new Response(
      JSON.stringify({
        registration: row.registration,
        familyMember: {
          id: row.familyMember.id,
          firstName: row.familyMember.firstName,
          lastName: row.familyMember.lastName,
          birthDate: row.familyMember.birthDate,
        },
        season: {
          id: row.season.id,
          name: row.season.name,
          startDate: row.season.startDate,
          endDate: row.season.endDate,
          priceCents: row.season.priceCents,
        },
        program: {
          id: row.program.id,
          name: row.program.name,
          slug: row.program.slug,
        },
        sport: {
          id: row.sport.id,
          name: row.sport.name,
          slug: row.sport.slug,
        },
        location: {
          id: row.location.id,
          name: row.location.name,
        },
        parent: row.parent,
        paymentHistory,
        team,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error fetching admin registration detail:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

/**
 * Hard-delete a registration row. Guarded: refuses when the row has paid
 * money that has not been refunded (`amountPaidCents > 0 && paymentStatus !=
 * 'refunded'`), unless `?force=true` is passed. The guard is there to stop
 * an admin from deleting a row that still has live Stripe money — the right
 * flow is refund first, then delete.
 *
 * Payment rows are never deleted: `payments.registrationId` is
 * `onDelete: restrict` by design (the Stripe money trail must survive), so
 * the delete detaches them (registrationId → null) inside one transaction
 * with the registration delete. The orphaned payment rows keep their Stripe
 * PIs and remain findable in payment reports. Installment schedule rows
 * (`payment_plans` + cascading `scheduled_payments`) are metadata, not money
 * records, and are deleted outright.
 */
export const DELETE: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const { id } = context.params;
  if (!id) {
    return new Response(JSON.stringify({ error: "Registration ID required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const force = new URL(context.request.url).searchParams.get("force") === "true";

  try {
    const [row] = await getDb()
      .select({
        registration: registrations,
      })
      .from(registrations)
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(
        and(
          eq(registrations.id, id),
          eq(locations.organizationId, orgContext.organizationId),
        ),
      );

    if (!row) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const amountPaid = row.registration.amountPaidCents ?? 0;
    const hasUnreturnedMoney =
      amountPaid > 0 && row.registration.paymentStatus !== "refunded";

    if (hasUnreturnedMoney && !force) {
      return new Response(
        JSON.stringify({
          error: "Refund the registration before deleting, or pass force=true",
          amountPaidCents: amountPaid,
          paymentStatus: row.registration.paymentStatus,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }

    // #529: a team-funded registration carries no per-registration money
    // (amountPaidCents 0) but its spot IS paid for by the team's
    // deposit/backstop — deleting it silently drops a paid roster spot.
    // Same 409-unless-forced contract as directly-paid registrations.
    if (!force) {
      const funded = await teamFundedRegistrations(getDb(), [id]);
      const team = funded.get(id);
      if (team) {
        return new Response(
          JSON.stringify({
            error:
              `This registration is team-funded (team "${team.teamName}" ` +
              `paid its deposit). Resolve the team's money first, or pass ` +
              `force=true`,
            teamRegistrationId: team.teamRegistrationId,
          }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    await getDb().transaction(async (tx) => {
      // Detach (never delete) payment rows — restrict FK, see doc comment.
      await tx
        .update(payments)
        .set({ registrationId: null })
        .where(eq(payments.registrationId, id));
      // Installment schedules are metadata; scheduled_payments cascade.
      await tx.delete(paymentPlans).where(eq(paymentPlans.registrationId, id));
      await tx.delete(registrations).where(eq(registrations.id, id));
    });

    return new Response(
      JSON.stringify({ success: true, deletedId: id, forced: force }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    // A residual FK restrict (a referencing table this handler doesn't know
    // about yet) should read as a clear conflict, not a blind 500.
    const code = (error as { code?: string; cause?: { code?: string } })?.code ??
      (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23503") {
      const detail =
        (error as { table_name?: string; cause?: { table_name?: string } })?.table_name ??
        (error as { cause?: { table_name?: string } })?.cause?.table_name;
      console.error("Registration delete blocked by FK:", detail ?? "unknown table", error);
      return new Response(
        JSON.stringify({
          error: `Delete blocked: another record still references this registration${detail ? ` (${detail})` : ""}. Report this — the delete handler needs to learn about that table.`,
        }),
        { status: 409, headers: { "Content-Type": "application/json" } },
      );
    }
    console.error("Error deleting registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
