import { describe, it, expect, vi, beforeEach } from "vitest";

let queue: unknown[] = [];
vi.mock("@/lib/media/get-tagging-queue", () => ({
  getTaggingQueue: async () => queue,
}));

import { GET } from "@/pages/api/media/nav-badges";

const ctx = (roles: string[]) =>
  ({ locals: { user: { id: "u1" }, userRoles: roles.map((name) => ({ name })) } }) as never;

describe("GET /api/media/nav-badges", () => {
  beforeEach(() => { queue = []; });

  it("returns 0 for a non-editor (media_staff)", async () => {
    queue = [{}, {}];
    const res = await GET(ctx(["media_staff"]));
    expect(await res.json()).toEqual({ mediaQueue: 0 });
  });

  it("returns the queue length for an editor", async () => {
    queue = [{}, {}, {}];
    const res = await GET(ctx(["media_editor"]));
    expect(await res.json()).toEqual({ mediaQueue: 3 });
  });
});
