import { describe, it, expect } from "vitest";
import { draftCampPods, type CampPodCandidate } from "@/lib/camps/form-pods";

function candidate(
  registrationId: string,
  opts: Partial<Omit<CampPodCandidate, "registrationId">> = {},
): CampPodCandidate {
  return {
    registrationId,
    familyMemberId: `fm-${registrationId}`,
    birthDate: opts.birthDate ?? null,
    skillScore: opts.skillScore ?? null,
    gender: opts.gender ?? null,
  };
}

function pod(teamId: string, maxRosterSize: number | null = null) {
  return { teamId, maxRosterSize };
}

function podFor(
  result: ReturnType<typeof draftCampPods>,
  registrationId: string,
): string | undefined {
  return result.pods.find((p) => p.registrationIds.includes(registrationId))?.teamId;
}

describe("draftCampPods", () => {
  it("bands 12 kids across 3 uncapped pods 4-4-4, contiguous by DOB", () => {
    const candidates = [
      candidate("reg-01", { birthDate: "2015-06-15" }),
      candidate("reg-02", { birthDate: "2015-01-10" }),
      candidate("reg-03", { birthDate: "2015-11-20" }),
      candidate("reg-04", { birthDate: "2015-03-05" }),
      candidate("reg-05", { birthDate: "2015-09-01" }),
      candidate("reg-06", { birthDate: "2015-12-25" }),
      candidate("reg-07", { birthDate: "2015-02-14" }),
      candidate("reg-08", { birthDate: "2015-07-07" }),
      candidate("reg-09", { birthDate: "2015-04-18" }),
      candidate("reg-10", { birthDate: "2015-10-30" }),
      candidate("reg-11", { birthDate: "2015-05-22" }),
      candidate("reg-12", { birthDate: "2015-08-08" }),
    ];
    const pods = [pod("pod-a"), pod("pod-b"), pod("pod-c")];

    const result = draftCampPods(candidates, pods, "age");

    expect(result.unplaced).toEqual([]);
    expect(result.pods).toHaveLength(3);
    expect(result.pods.map((p) => p.registrationIds.length)).toEqual([4, 4, 4]);
    // sorted descending by birthDate (youngest/most-recent first), then split
    // into contiguous bands of 4 in teamId order.
    expect(result.pods[0]).toEqual({
      teamId: "pod-a",
      registrationIds: ["reg-06", "reg-03", "reg-10", "reg-05"],
    });
    expect(result.pods[1]).toEqual({
      teamId: "pod-b",
      registrationIds: ["reg-12", "reg-08", "reg-01", "reg-11"],
    });
    expect(result.pods[2]).toEqual({
      teamId: "pod-c",
      registrationIds: ["reg-09", "reg-04", "reg-07", "reg-02"],
    });
  });

  it("bands 13 kids across 3 uncapped pods 5-4-4 (remainder to earliest pods)", () => {
    const candidates = [
      candidate("reg-01", { birthDate: "2015-06-15" }),
      candidate("reg-02", { birthDate: "2015-01-10" }),
      candidate("reg-03", { birthDate: "2015-11-20" }),
      candidate("reg-04", { birthDate: "2015-03-05" }),
      candidate("reg-05", { birthDate: "2015-09-01" }),
      candidate("reg-06", { birthDate: "2015-12-25" }),
      candidate("reg-07", { birthDate: "2015-02-14" }),
      candidate("reg-08", { birthDate: "2015-07-07" }),
      candidate("reg-09", { birthDate: "2015-04-18" }),
      candidate("reg-10", { birthDate: "2015-10-30" }),
      candidate("reg-11", { birthDate: "2015-05-22" }),
      candidate("reg-12", { birthDate: "2015-08-08" }),
      candidate("reg-13", { birthDate: "2015-12-31" }),
    ];
    const pods = [pod("pod-a"), pod("pod-b"), pod("pod-c")];

    const result = draftCampPods(candidates, pods, "age");

    expect(result.unplaced).toEqual([]);
    expect(result.pods.map((p) => p.registrationIds.length)).toEqual([5, 4, 4]);
    expect(result.pods[0].registrationIds).toEqual([
      "reg-13",
      "reg-06",
      "reg-03",
      "reg-10",
      "reg-05",
    ]);
    expect(result.pods[1].registrationIds).toEqual(["reg-12", "reg-08", "reg-01", "reg-11"]);
    expect(result.pods[2].registrationIds).toEqual(["reg-09", "reg-04", "reg-07", "reg-02"]);
  });

  it("puts the youngest camper in pod 1 for the age strategy", () => {
    const candidates = [
      candidate("old", { birthDate: "2010-01-01" }),
      candidate("mid", { birthDate: "2013-01-01" }),
      candidate("young", { birthDate: "2016-01-01" }),
    ];
    const pods = [pod("pod-a"), pod("pod-b"), pod("pod-c")];

    const result = draftCampPods(candidates, pods, "age");

    expect(podFor(result, "young")).toBe("pod-a");
    expect(podFor(result, "old")).toBe("pod-c");
  });

  it("sorts null birthDates last within the age strategy", () => {
    const candidates = [
      candidate("no-dob-a", { birthDate: null }),
      candidate("has-dob", { birthDate: "2015-01-01" }),
      candidate("no-dob-b", { birthDate: null }),
    ];
    const pods = [pod("pod-a")];

    const result = draftCampPods(candidates, pods, "age");

    // has-dob sorts first (only non-null key); nulls sort last, tie-broken by
    // registrationId asc.
    expect(result.pods[0].registrationIds).toEqual(["has-dob", "no-dob-a", "no-dob-b"]);
  });

  it("orders skill strategy ascending with nulls landing in the final band", () => {
    const candidates = [
      candidate("sk-a", { skillScore: 5 }),
      candidate("sk-b", { skillScore: 2 }),
      candidate("sk-c", { skillScore: null }),
      candidate("sk-d", { skillScore: 8 }),
      candidate("sk-e", { skillScore: null }),
      candidate("sk-f", { skillScore: 1 }),
    ];
    const pods = [pod("pod-a"), pod("pod-b")];

    const result = draftCampPods(candidates, pods, "skill");

    expect(result.unplaced).toEqual([]);
    expect(result.pods[0].registrationIds).toEqual(["sk-f", "sk-b", "sk-a"]);
    // nulls sort last (tie-broken by registrationId asc: sk-c before sk-e)
    // and land in the final band alongside the highest skill score.
    expect(result.pods[1].registrationIds).toEqual(["sk-d", "sk-c", "sk-e"]);
  });

  it("breaks ties on equal strategy key by registrationId ascending", () => {
    const candidates = [
      candidate("reg-z", { skillScore: 3 }),
      candidate("reg-a", { skillScore: 3 }),
      candidate("reg-m", { skillScore: 3 }),
    ];
    const pods = [pod("pod-a")];

    const result = draftCampPods(candidates, pods, "skill");

    expect(result.pods[0].registrationIds).toEqual(["reg-a", "reg-m", "reg-z"]);
  });

  it("spills overflow to unplaced when caps bind, filling capped pods left to right", () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      candidate(`cap-${i + 1}`, { birthDate: `2015-0${8 - i}-01` }),
    );
    // descending-birthDate sort order is exactly cap-1..cap-8 (cap-1 has the
    // latest date, i.e. is youngest).
    const pods = [pod("pod-a", 2), pod("pod-b", 2), pod("pod-c", 2)];

    const result = draftCampPods(candidates, pods, "age");

    expect(result.pods.map((p) => p.registrationIds)).toEqual([
      ["cap-1", "cap-2"],
      ["cap-3", "cap-4"],
      ["cap-5", "cap-6"],
    ]);
    expect(result.unplaced).toEqual(["cap-7", "cap-8"]);
  });

  it("lets an uncapped pod absorb overflow spilled from an earlier capped pod", () => {
    const candidates = Array.from({ length: 12 }, (_, i) =>
      candidate(`c-${String(i + 1).padStart(2, "0")}`, {
        birthDate: `2015-${String(12 - i).padStart(2, "0")}-01`,
      }),
    );
    const pods = [pod("pod-a", 3), pod("pod-b", null), pod("pod-c", null)];

    const result = draftCampPods(candidates, pods, "age");

    expect(result.unplaced).toEqual([]);
    // even split targets [4,4,4]; pod-a (cap 3) can only take 3, the excess 1
    // carries forward into pod-b's target (4+1=5, uncapped so all 5 fit).
    expect(result.pods.map((p) => p.registrationIds.length)).toEqual([3, 5, 4]);
  });

  it("is deterministic regardless of input candidate/pod ordering", () => {
    const candidates = [
      candidate("reg-01", { birthDate: "2015-06-15", skillScore: 4 }),
      candidate("reg-02", { birthDate: "2015-01-10", skillScore: 2 }),
      candidate("reg-03", { birthDate: "2015-11-20", skillScore: null }),
      candidate("reg-04", { birthDate: "2015-03-05", skillScore: 7 }),
      candidate("reg-05", { birthDate: "2015-09-01", skillScore: null }),
      candidate("reg-06", { birthDate: "2015-12-25", skillScore: 1 }),
      candidate("reg-07", { birthDate: null, skillScore: 3 }),
    ];
    const pods = [pod("pod-a", 3), pod("pod-b"), pod("pod-c", 2)];

    for (const strategy of ["age", "skill"] as const) {
      const a = draftCampPods(candidates, pods, strategy);
      const b = draftCampPods([...candidates].reverse(), [...pods].reverse(), strategy);
      const c = draftCampPods(candidates, pods, strategy);

      expect(b).toEqual(a);
      expect(c).toEqual(a);
    }
  });

  it("conserves every registrationId exactly once across pods + unplaced", () => {
    const candidates = Array.from({ length: 17 }, (_, i) =>
      candidate(`c-${String(i + 1).padStart(2, "0")}`, {
        birthDate: i % 3 === 0 ? null : `2015-${String((i % 12) + 1).padStart(2, "0")}-15`,
        skillScore: i % 4 === 0 ? null : i,
      }),
    );
    const pods = [pod("pod-a", 4), pod("pod-b"), pod("pod-c", 5)];

    for (const strategy of ["age", "skill"] as const) {
      const result = draftCampPods(candidates, pods, strategy);
      const allIds = [...result.pods.flatMap((p) => p.registrationIds), ...result.unplaced];

      expect(allIds).toHaveLength(candidates.length);
      expect(new Set(allIds).size).toBe(candidates.length);
      expect([...allIds].sort()).toEqual(candidates.map((c) => c.registrationId).sort());
    }
  });

  it("returns every candidate as unplaced when there are zero pods", () => {
    const candidates = [candidate("reg-02"), candidate("reg-01")];

    const result = draftCampPods(candidates, [], "age");

    expect(result.pods).toEqual([]);
    expect(result.unplaced).toHaveLength(2);
    expect([...result.unplaced].sort()).toEqual(["reg-01", "reg-02"]);
  });

  it("handles zero candidates", () => {
    const result = draftCampPods([], [pod("pod-a"), pod("pod-b")], "age");

    expect(result.pods).toEqual([
      { teamId: "pod-a", registrationIds: [] },
      { teamId: "pod-b", registrationIds: [] },
    ]);
    expect(result.unplaced).toEqual([]);
  });
});
