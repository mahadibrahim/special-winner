/**
 * Youth rosters split the FULL team fee (winter-team-fixes, task 5).
 *
 * POST /api/public/team-registrations/[token]/invite's bare `{ emails: [] }`
 * shorthand even-splits a "splittable" amount across the invitee list:
 *  - Youth season: splittable = the full team fee. The captain's deposit is
 *    a refundable hold, never a per-share credit, so it must not shrink the
 *    amount the roster is asked to cover.
 *  - Adult season (unchanged): splittable = team fee minus the $200 deposit,
 *    since the captain's own spot IS credited by the deposit.
 *
 * Uses `seedTeamPaymentContext` (real DB rows, no Stripe) — the fixture team
 * already has teamFeeCents=$1,050 / depositCents=$200 and a real captain
 * account with a known password, so the invite endpoint's captain-only auth
 * can be exercised over real HTTP without going through Stripe at all.
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { seasons, ageGroups } from "@/lib/db/schema";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import {
  seedTeamPaymentContext,
  CAPTAIN_PASSWORD,
  TEAM_FEE_CENTS,
  DEPOSIT_CENTS,
} from "../utils/team-payment-context";

async function makeYouthSeason(seasonId: string) {
  await getDb().update(seasons).set({ minAge: 8 }).where(eq(seasons.id, seasonId));
}

/** The production youth shape (fix round 1, minor c): real seasons carry no
 *  `seasons.minAge` override — they're age-group-led by construction. This
 *  exercises invite.ts's `leftJoin(ageGroups)` resolution branch, not just
 *  the direct `seasons.minAge` one `makeYouthSeason` above covers. */
async function makeYouthSeasonViaAgeGroup(organizationId: string, seasonId: string) {
  const db = getDb();
  const [ageGroup] = await db
    .insert(ageGroups)
    .values({ organizationId, name: "U10", minAge: 6, maxAge: 10 })
    .returning();
  await db
    .update(seasons)
    .set({ ageGroupId: ageGroup.id, minAge: null })
    .where(eq(seasons.id, seasonId));
}

async function inviteEmails(token: string, cookie: string, emails: string[]) {
  return apiFetch(`/api/public/team-registrations/${token}/invite`, {
    method: "POST",
    cookie,
    body: JSON.stringify({ emails }),
  });
}

async function getInviteeSharesByEmail(
  token: string,
  cookie: string,
): Promise<Map<string, number>> {
  const res = await apiFetch(`/api/public/team-registrations/${token}`, { cookie });
  const json = (await res.json()) as {
    team: { invitees: { email: string; assignedShareCents: number }[] };
  };
  return new Map(json.team.invitees.map((i) => [i.email.toLowerCase(), i.assignedShareCents]));
}

describe("POST /invite bare email-list split — youth vs adult", () => {
  it("youth: even-splits the FULL team fee (deposit not subtracted)", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeason(ctx.seasonId);
    const cookie = await getAuthCookie(ctx.captainEmail, CAPTAIN_PASSWORD);
    const token = `tok-${ctx.suffix}`;

    const suffix = Math.random().toString(36).slice(2, 10);
    const emails = [`ysplit-a-${suffix}@test.example`, `ysplit-b-${suffix}@test.example`, `ysplit-c-${suffix}@test.example`];

    const res = await inviteEmails(token, cookie, emails);
    expect(res.status).toBe(200);

    const byEmail = await getInviteeSharesByEmail(token, cookie);
    const ours = emails.map((e) => byEmail.get(e)!);
    expect(ours.every((v) => v != null)).toBe(true);
    // Sum of the split = the full team fee (assignEvenShares distributes the
    // remainder across the first rows, never losing/gaining a cent overall).
    const total = ours.reduce((a, b) => a + b, 0);
    expect(total).toBe(TEAM_FEE_CENTS);
    const min = Math.min(...ours);
    const max = Math.max(...ours);
    expect(max - min).toBeLessThanOrEqual(1);
  });

  it("youth via a real age group (no seasons.minAge): even-splits the FULL team fee", async () => {
    const ctx = await seedTeamPaymentContext();
    await makeYouthSeasonViaAgeGroup(ctx.organizationId, ctx.seasonId);
    const cookie = await getAuthCookie(ctx.captainEmail, CAPTAIN_PASSWORD);
    const token = `tok-${ctx.suffix}`;

    const suffix = Math.random().toString(36).slice(2, 10);
    const emails = [`ysplitag-a-${suffix}@test.example`, `ysplitag-b-${suffix}@test.example`];

    const res = await inviteEmails(token, cookie, emails);
    expect(res.status).toBe(200);

    const byEmail = await getInviteeSharesByEmail(token, cookie);
    const ours = emails.map((e) => byEmail.get(e)!);
    expect(ours.every((v) => v != null)).toBe(true);
    const total = ours.reduce((a, b) => a + b, 0);
    expect(total).toBe(TEAM_FEE_CENTS);
  });

  it("adult: even-splits (team fee minus the $200 deposit), unchanged", async () => {
    const ctx = await seedTeamPaymentContext(); // adult by default
    const cookie = await getAuthCookie(ctx.captainEmail, CAPTAIN_PASSWORD);
    const token = `tok-${ctx.suffix}`;

    const suffix = Math.random().toString(36).slice(2, 10);
    const emails = [`asplit-a-${suffix}@test.example`, `asplit-b-${suffix}@test.example`];

    const res = await inviteEmails(token, cookie, emails);
    expect(res.status).toBe(200);

    const byEmail = await getInviteeSharesByEmail(token, cookie);
    const ours = emails.map((e) => byEmail.get(e)!);
    expect(ours.every((v) => v != null)).toBe(true);
    const total = ours.reduce((a, b) => a + b, 0);
    expect(total).toBe(TEAM_FEE_CENTS - DEPOSIT_CENTS);
  });
});
