import { describe, it, expect } from "vitest";
import { getAuthCookie } from "./setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

describe("team linkage via ?team= token", () => {
  it("a teammate registration appears on the team roster", async () => {
    const season = (
      await (
        await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)
      ).json()
    ).seasons?.[0];
    expect(season?.id).toBeTruthy();

    // Phase B: creating a team requires an authenticated captain (the deposit
    // saves a card on file). With no Stripe configured in CI the endpoint
    // gracefully skips the deposit but still requires auth.
    const captainCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!",
    );

    const stamp = Date.now();
    const create = await (
      await fetch(`${BASE}/api/public/team-registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Cookie: captainCookie },
        body: JSON.stringify({
          seasonId: season.id,
          teamName: `Linkage Test ${stamp}`,
          captainName: "Cap Tain",
          captainEmail: `cap-${stamp}@test.aspiresports.com`,
        }),
      })
    ).json();
    expect(create.inviteToken).toBeTruthy();

    const before = (
      await (
        await fetch(
          `${BASE}/api/public/team-registrations/${create.inviteToken}`,
        )
      ).json()
    ).team.memberCount;

    // adult-self guest checkout WITH the team token — match the exact body
    // shape guest-checkout.ts expects (the `registrant` adult-self branch).
    await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId: season.id,
        registrationType: "full",
        teamToken: create.inviteToken,
        registrant: {
          firstName: "Team",
          lastName: "Mate",
          email: `mate-${stamp}@test.aspiresports.com`,
          birthDate: "1995-05-05",
          isSelf: true,
        },
        waiverSigned: true,
        waiverSignedBy: "Team Mate",
      }),
    });

    const after = (
      await (
        await fetch(
          `${BASE}/api/public/team-registrations/${create.inviteToken}`,
        )
      ).json()
    ).team.memberCount;
    expect(after).toBe(before + 1);
  });
});
