import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  guestDraftKey,
  stashGuestDraft,
  readGuestDraft,
  clearGuestDraft,
  type GuestDraft,
} from "@/lib/registrations/guest-draft";

/**
 * Guest adult-self draft stash — sessionStorage bridge for the sign-in round
 * trip (see registration-wizard.tsx's handleGuestSignInClick). Scope is
 * deliberately narrow: adult self fields only, never child/DOB/phone — these
 * tests pin the shape as much as the storage mechanics.
 */

function makeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

let storage: Storage;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal("window", { sessionStorage: storage });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const draft: GuestDraft = {
  v: 1,
  seasonId: "season-1",
  firstName: "Floor",
  lastName: "Walker",
  email: "floor@example.com",
};

describe("guestDraftKey", () => {
  it("namespaces by season", () => {
    expect(guestDraftKey("season-1")).toBe("aspire:guest-draft:season-1");
    expect(guestDraftKey("season-2")).toBe("aspire:guest-draft:season-2");
  });
});

describe("stashGuestDraft / readGuestDraft / clearGuestDraft", () => {
  it("round-trips a stashed draft", () => {
    stashGuestDraft(draft);
    expect(readGuestDraft("season-1")).toEqual(draft);
  });

  it("stores only the adult-self fields — never child, DOB, or phone", () => {
    stashGuestDraft(draft);
    const raw = JSON.parse(storage.getItem(guestDraftKey("season-1"))!);
    expect(Object.keys(raw).sort()).toEqual(
      ["email", "firstName", "lastName", "seasonId", "v"].sort(),
    );
  });

  it("scopes reads to the requesting season — a draft for a different season is invisible", () => {
    stashGuestDraft(draft);
    expect(readGuestDraft("season-other")).toBeNull();
  });

  it("returns null when nothing is stashed", () => {
    expect(readGuestDraft("season-1")).toBeNull();
  });

  it("clears the stash", () => {
    stashGuestDraft(draft);
    clearGuestDraft("season-1");
    expect(readGuestDraft("season-1")).toBeNull();
  });

  it("tolerates corrupted storage contents", () => {
    storage.setItem(guestDraftKey("season-1"), "not json{");
    expect(readGuestDraft("season-1")).toBeNull();
  });

  it("rejects a draft with the wrong version", () => {
    storage.setItem(
      guestDraftKey("season-1"),
      JSON.stringify({ ...draft, v: 2 }),
    );
    expect(readGuestDraft("season-1")).toBeNull();
  });

  it("rejects a malformed shape (missing fields)", () => {
    storage.setItem(
      guestDraftKey("season-1"),
      JSON.stringify({ v: 1, seasonId: "season-1" }),
    );
    expect(readGuestDraft("season-1")).toBeNull();
  });

  it("no-ops safely when window/sessionStorage is unavailable (SSR)", () => {
    vi.unstubAllGlobals();
    expect(() => stashGuestDraft(draft)).not.toThrow();
    expect(readGuestDraft("season-1")).toBeNull();
    expect(() => clearGuestDraft("season-1")).not.toThrow();
  });
});
