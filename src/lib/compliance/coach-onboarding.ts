/**
 * Coach onboarding checklist — pure functions only (no DB imports;
 * unit-testable), mirroring the house style of
 * src/lib/compliance/coach-credentials.ts.
 *
 * The task set is a hardcoded constant per the Phase 2 spec
 * (docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md,
 * "Phase 2" section): reading requirements, two auto-detected facts already
 * tracked elsewhere in the system, and one admin-confirmed step. There is no
 * per-org task catalog — adding a task is a code change to ONBOARDING_TASKS,
 * not a schema change.
 */

export type OnboardingTaskKind = "manual" | "auto" | "admin_confirm";

export interface OnboardingTaskDef {
  key: string;
  label: string;
  description: string;
  kind: OnboardingTaskKind;
}

export const ONBOARDING_TASKS: OnboardingTaskDef[] = [
  {
    key: "philosophy_read",
    label: "Read the Aspire coaching philosophy",
    description:
      "Development over winning, the ELM framework, the 5:1 ratio — the non-negotiables every session is built on.",
    kind: "manual",
  },
  {
    key: "coach_manual_read",
    label: "Read the coach manual",
    description:
      "Day-of procedures for league practices, skills classes, camp days, and clinics, plus safety escalation and parent communication.",
    kind: "manual",
  },
  {
    key: "sport_guide_reviewed",
    label: "Review your sport's development guide",
    description:
      "Sport-specific technique and age-band guidance and the relevant skill minibooks for the sport(s) you'll coach.",
    kind: "manual",
  },
  {
    key: "credentials_complete",
    label: "Submit required credentials",
    description:
      "SafeSport, background check, CPR/first-aid, and concussion protocol — auto-detected once an admin marks all four valid.",
    kind: "auto",
  },
  {
    key: "first_practice_plan_created",
    label: "Create your first practice plan",
    description:
      "Auto-detected the first time a session plan exists for one of your teams.",
    kind: "auto",
  },
  {
    key: "shadow_session_confirmed",
    label: "Shadow session confirmed",
    description:
      "An admin confirms you've shadowed an experienced coach for at least one session.",
    kind: "admin_confirm",
  },
];

export const MANUAL_TASK_KEYS = ONBOARDING_TASKS.filter(
  (t) => t.kind === "manual",
).map((t) => t.key);
export const AUTO_TASK_KEYS = ONBOARDING_TASKS.filter(
  (t) => t.kind === "auto",
).map((t) => t.key);
export const ADMIN_CONFIRM_TASK_KEYS = ONBOARDING_TASKS.filter(
  (t) => t.kind === "admin_confirm",
).map((t) => t.key);

export interface AutoFlags {
  credentials_complete: boolean;
  first_practice_plan_created: boolean;
}

export interface OnboardingTaskStatus extends OnboardingTaskDef {
  completed: boolean;
  completedAt: Date | null;
}

/** Minimal shape needed from a coach_onboarding_progress row. */
export interface ProgressRowLike {
  taskKey: string;
  completedAt: Date;
}

/**
 * Merge stored completion rows with live-computed auto flags into the full,
 * ordered task list. A task is `completed` if either a row exists for it OR
 * (for `auto` kind tasks only) its flag is currently true — the flag lets a
 * caller show "complete" before the write-once persistence step runs; once
 * persisted, the row's completedAt wins and is stable even if the flag later
 * flips back to false (see Design decision 3 in the plan).
 */
export function mergeOnboardingTasks(
  progressRows: ProgressRowLike[],
  autoFlags: AutoFlags,
): OnboardingTaskStatus[] {
  const rowByKey = new Map(progressRows.map((r) => [r.taskKey, r.completedAt]));
  return ONBOARDING_TASKS.map((def) => {
    const recordedAt = rowByKey.get(def.key) ?? null;
    const autoComplete =
      def.kind === "auto" &&
      Boolean(autoFlags[def.key as keyof AutoFlags]);
    return {
      ...def,
      completed: recordedAt !== null || autoComplete,
      completedAt: recordedAt,
    };
  });
}

export function isOnboardingComplete(tasks: OnboardingTaskStatus[]): boolean {
  return tasks.every((t) => t.completed);
}
