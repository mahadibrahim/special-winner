import { describe, it, expect } from "vitest";
import { renderPlayerWaiverInvite, renderPlayerWaiverReminder } from "@/lib/rentals/messages/player-waiver";

const base = {
  playerName: "Jamie",
  venueName: "Worthington",
  whenLabel: "Sep 1, 6:00 PM",
  signUrl: "https://x/self-serve/abc",
  brand: "soccerone" as const,
};

describe("player waiver messages", () => {
  it("invite (adult) has link + no parent phrasing", async () => {
    const m = await renderPlayerWaiverInvite({ ...base, isMinor: false });
    expect(m.email.subject).toMatch(/waiver/i);
    expect(m.email.html).toMatch(/self-serve\/abc/);
    expect(m.email.html).not.toMatch(/on behalf of/i);
  });

  it("invite (minor) mentions signing for the child", async () => {
    const m = await renderPlayerWaiverInvite({ ...base, isMinor: true });
    expect(m.email.html).toMatch(/Jamie/);
    expect(m.email.html).toMatch(/behalf|parent|guardian/i);
  });

  it("reminder subject differs", async () => {
    const m = await renderPlayerWaiverReminder({ ...base, isMinor: false });
    expect(m.email.subject).toMatch(/reminder|still|don't forget/i);
  });
});
