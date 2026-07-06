import { describe, it, expect } from "vitest";
import {
  ONBOARDING_TASKS,
  MANUAL_TASK_KEYS,
  AUTO_TASK_KEYS,
  ADMIN_CONFIRM_TASK_KEYS,
  mergeOnboardingTasks,
  isOnboardingComplete,
} from "@/lib/compliance/coach-onboarding";

describe("ONBOARDING_TASKS", () => {
  it("is the hardcoded six-task checklist, in display order", () => {
    expect(ONBOARDING_TASKS.map((t) => t.key)).toEqual([
      "philosophy_read",
      "coach_manual_read",
      "sport_guide_reviewed",
      "credentials_complete",
      "first_practice_plan_created",
      "shadow_session_confirmed",
    ]);
  });

  it("splits into manual/auto/admin_confirm kinds with no overlap", () => {
    expect(MANUAL_TASK_KEYS).toEqual([
      "philosophy_read",
      "coach_manual_read",
      "sport_guide_reviewed",
    ]);
    expect(AUTO_TASK_KEYS).toEqual([
      "credentials_complete",
      "first_practice_plan_created",
    ]);
    expect(ADMIN_CONFIRM_TASK_KEYS).toEqual(["shadow_session_confirmed"]);
    expect(
      MANUAL_TASK_KEYS.length +
        AUTO_TASK_KEYS.length +
        ADMIN_CONFIRM_TASK_KEYS.length,
    ).toBe(ONBOARDING_TASKS.length);
  });
});

describe("mergeOnboardingTasks", () => {
  const noAutoFlags = {
    credentials_complete: false,
    first_practice_plan_created: false,
  };

  it("everything incomplete with no rows and no auto flags", () => {
    const tasks = mergeOnboardingTasks([], noAutoFlags);
    expect(tasks).toHaveLength(6);
    expect(tasks.every((t) => !t.completed)).toBe(true);
    expect(tasks.every((t) => t.completedAt === null)).toBe(true);
  });

  it("a manual task is complete only when a progress row exists", () => {
    const completedAt = new Date("2026-07-01T00:00:00Z");
    const tasks = mergeOnboardingTasks(
      [{ taskKey: "philosophy_read", completedAt }],
      noAutoFlags,
    );
    const philosophy = tasks.find((t) => t.key === "philosophy_read")!;
    expect(philosophy.completed).toBe(true);
    expect(philosophy.completedAt).toEqual(completedAt);
    const manual = tasks.find((t) => t.key === "coach_manual_read")!;
    expect(manual.completed).toBe(false);
  });

  it("an auto task is complete when its flag is true even with no row yet (completedAt null)", () => {
    const tasks = mergeOnboardingTasks([], {
      credentials_complete: true,
      first_practice_plan_created: false,
    });
    const cred = tasks.find((t) => t.key === "credentials_complete")!;
    expect(cred.completed).toBe(true);
    expect(cred.completedAt).toBeNull();
    const plan = tasks.find((t) => t.key === "first_practice_plan_created")!;
    expect(plan.completed).toBe(false);
  });

  it("an auto task stays complete via its row even if the flag later goes false", () => {
    const completedAt = new Date("2026-06-01T00:00:00Z");
    const tasks = mergeOnboardingTasks(
      [{ taskKey: "credentials_complete", completedAt }],
      { credentials_complete: false, first_practice_plan_created: false },
    );
    const cred = tasks.find((t) => t.key === "credentials_complete")!;
    expect(cred.completed).toBe(true);
    expect(cred.completedAt).toEqual(completedAt);
  });

  it("an admin_confirm task is complete only via a row — auto flags never apply to it", () => {
    const tasks = mergeOnboardingTasks([], noAutoFlags);
    const shadow = tasks.find((t) => t.key === "shadow_session_confirmed")!;
    expect(shadow.completed).toBe(false);
    expect(shadow.kind).toBe("admin_confirm");
  });

  it("preserves ONBOARDING_TASKS display order regardless of row order", () => {
    const tasks = mergeOnboardingTasks(
      [
        { taskKey: "shadow_session_confirmed", completedAt: new Date() },
        { taskKey: "philosophy_read", completedAt: new Date() },
      ],
      noAutoFlags,
    );
    expect(tasks.map((t) => t.key)).toEqual(ONBOARDING_TASKS.map((t) => t.key));
  });
});

describe("isOnboardingComplete", () => {
  it("false when any task is incomplete", () => {
    const tasks = mergeOnboardingTasks([], {
      credentials_complete: false,
      first_practice_plan_created: false,
    });
    expect(isOnboardingComplete(tasks)).toBe(false);
  });

  it("true when every task has a row or an auto flag", () => {
    const now = new Date();
    const rows = [
      { taskKey: "philosophy_read", completedAt: now },
      { taskKey: "coach_manual_read", completedAt: now },
      { taskKey: "sport_guide_reviewed", completedAt: now },
      { taskKey: "shadow_session_confirmed", completedAt: now },
    ];
    const tasks = mergeOnboardingTasks(rows, {
      credentials_complete: true,
      first_practice_plan_created: true,
    });
    expect(isOnboardingComplete(tasks)).toBe(true);
  });
});
