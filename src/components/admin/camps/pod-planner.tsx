"use client";

/**
 * Task 4 of the 2026-09-06-camps-phase4 plan: the camp-group planner island.
 * Mirrors placement-planner.tsx (client-side draft state -> explicit publish)
 * with camp semantics:
 *
 * - GET /api/admin/seasons/:id/pods supplies the season (with its saved
 *   `formationStrategy`), every confirmed camper ("candidates" — including
 *   ones already in a group), and the season's camp groups with current
 *   published membership.
 * - The draft `assignments` map is seeded from PUBLISHED membership, because
 *   publishing is a FULL REPLACE: whatever the map holds on publish becomes
 *   the season's entire camp-group arrangement (POST
 *   /api/admin/seasons/:id/pod-placements, transactional, all-or-nothing).
 * - "Auto-arrange" runs `draftCampPods` (pure, client-side) per the chosen
 *   strategy — age-banded or skill-banded; "manual" disables it and staff
 *   assign campers by hand. Nothing is written until publish.
 *
 * Copy rule: user-facing language is "camp group" (groupNoun), never
 * "pod"/"team", and never raw ids. Ages render next to names ("Maya · 7").
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { draftCampPods } from "@/lib/camps/form-pods";

type FormationStrategy = "age" | "skill" | "manual";

interface SeasonInfo {
  id: string;
  name: string;
  formationStrategy: FormationStrategy | null;
  programType: string;
}
interface CandidateRow {
  registrationId: string;
  familyMemberId: string;
  birthDate: string | null;
  gender: string | null;
  skillScore: number | null;
  childName: string;
}
interface PodRow {
  teamId: string;
  name: string;
  maxRosterSize: number | null;
  memberRegistrationIds: string[];
}
interface PodData {
  season: SeasonInfo;
  candidates: CandidateRow[];
  pods: PodRow[];
}
interface PublishError {
  registrationId: string;
  reason: string;
}

/** Whole-year age from an ISO birth date, computed client-side ("Maya · 7"). */
function ageFromBirthDate(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const dob = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(dob.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate());
  if (beforeBirthday) age -= 1;
  return age >= 0 ? age : null;
}

export function PodPlanner({
  seasonId,
  seasonName,
  programName,
}: {
  seasonId: string;
  seasonName: string;
  programName: string;
}) {
  useHydrationBeacon();

  const [data, setData] = useState<PodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Draft state only — seeded from published membership on load, persisted
  // as the season's ENTIRE arrangement when publish() succeeds.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [strategy, setStrategy] = useState<FormationStrategy>("age");
  // Strategy-sorted near-misses from the last auto-arrange (campers no group
  // had room for), preserved in draft order so staff can work down the list.
  const [unplacedIds, setUnplacedIds] = useState<string[]>([]);

  const [publishing, setPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState<PublishError[] | null>(null);

  // Empty-state inline scaffold form (mirrors placement-planner's F2 fix):
  // calls the existing scaffold endpoint with camp naming — "<program> Group
  // N", never "Team".
  const [scaffoldCount, setScaffoldCount] = useState(3);
  const [scaffoldMaxSize, setScaffoldMaxSize] = useState<number | "">(12);
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);

  async function scaffoldGroups() {
    setScaffolding(true);
    setScaffoldError(null);
    try {
      const res = await fetch(`/api/admin/seasons/${seasonId}/teams/scaffold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count: scaffoldCount,
          maxRosterSize: scaffoldMaxSize === "" ? null : scaffoldMaxSize,
          namePrefix: programName,
          nameNoun: "Group",
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to create camp groups (${res.status})`);
      }
      toast.success("Camp groups created.");
      await loadPodData();
    } catch (e) {
      setScaffoldError(e instanceof Error ? e.message : "Failed to create camp groups.");
    } finally {
      setScaffolding(false);
    }
  }

  async function loadPodData() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/seasons/${seasonId}/pods`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load camp groups (${res.status})`);
      }
      const body: PodData = await res.json();
      setData(body);
      setStrategy(body.season.formationStrategy ?? "age");
      // Seed the draft from PUBLISHED membership (full-replace semantics —
      // publishing an untouched draft republishes the current arrangement).
      const seeded: Record<string, string> = {};
      const candidateIds = new Set(body.candidates.map((c) => c.registrationId));
      for (const pod of body.pods) {
        for (const registrationId of pod.memberRegistrationIds) {
          if (candidateIds.has(registrationId)) seeded[registrationId] = pod.teamId;
        }
      }
      setAssignments(seeded);
      setUnplacedIds([]);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load camp groups.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPodData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonId]);

  function setAssignment(registrationId: string, teamId: string) {
    setAssignments((prev) => {
      const next = { ...prev };
      if (teamId) {
        next[registrationId] = teamId;
      } else {
        delete next[registrationId];
      }
      return next;
    });
    setUnplacedIds((prev) =>
      prev.includes(registrationId) ? prev.filter((id) => id !== registrationId) : prev,
    );
  }

  function autoArrange() {
    if (!data || strategy === "manual") return;
    const result = draftCampPods(
      data.candidates.map((c) => ({
        registrationId: c.registrationId,
        familyMemberId: c.familyMemberId,
        birthDate: c.birthDate,
        skillScore: c.skillScore,
        gender: c.gender,
      })),
      data.pods.map((p) => ({ teamId: p.teamId, maxRosterSize: p.maxRosterSize })),
      strategy,
    );
    const next: Record<string, string> = {};
    for (const pod of result.pods) {
      for (const registrationId of pod.registrationIds) next[registrationId] = pod.teamId;
    }
    setAssignments(next);
    setUnplacedIds(result.unplaced);

    if (result.unplaced.length > 0) {
      toast.error(
        `${result.unplaced.length} camper${result.unplaced.length === 1 ? "" : "s"} could not be placed — every camp group is full.`,
      );
    } else if (data.candidates.length > 0) {
      toast.success("Draft camp groups arranged. Review, then publish.");
    }
  }

  async function publish() {
    if (!data) return;
    const placements = Object.entries(assignments).map(([registrationId, teamId]) => ({
      registrationId,
      teamId,
    }));
    if (placements.length === 0) {
      toast.error("Assign at least one camper to a camp group before publishing.");
      return;
    }

    setPublishing(true);
    setPublishErrors(null);
    try {
      const res = await fetch(`/api/admin/seasons/${seasonId}/pod-placements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ placements, formationStrategy: strategy }),
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        const errors: PublishError[] = Array.isArray(body.errors)
          ? body.errors
          : [{ registrationId: "", reason: body.error ?? "Validation failed." }];
        // Draft intentionally left untouched so staff can fix and retry.
        setPublishErrors(errors);
        toast.error("Camp groups could not be published — draft preserved.");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Publish failed (${res.status})`);
      }

      toast.success("Camp groups published.");
      await loadPodData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  const candidateById = new Map(data?.candidates.map((c) => [c.registrationId, c]) ?? []);

  function camperLabel(registrationId: string): string {
    const c = candidateById.get(registrationId);
    if (!c) return "Camper";
    const age = ageFromBirthDate(c.birthDate);
    return age != null ? `${c.childName} · ${age}` : c.childName;
  }

  const publishErrorMessage =
    publishErrors && publishErrors.length > 0
      ? publishErrors
          .map((e) => {
            const label = e.registrationId
              ? (candidateById.get(e.registrationId)?.childName ?? "A camper")
              : "Request";
            return `${label}: ${e.reason}`;
          })
          .join("\n")
      : null;

  const unplacedNames = unplacedIds.map((id) => camperLabel(id));

  return (
    <div data-testid="pod-planner" className="max-w-5xl mx-auto p-4 sm:p-6">
      <header className="mb-6">
        <a href={`/admin/seasons/${seasonId}`} className="text-xs text-ink-muted hover:text-ink">
          ← {seasonName}
        </a>
        <h1 className="font-display text-2xl text-ink mt-1">Camp Group Planner</h1>
        <p className="text-sm text-ink-muted">
          Arrange campers into camp groups, then publish. Nothing is saved until you hit Publish.
        </p>
      </header>

      {loadError && <ErrorBanner message={loadError} className="mb-4" />}

      {loading || !data ? (
        <LoadingSkeleton rows={6} />
      ) : data.pods.length === 0 ? (
        <EmptyState
          title="No camp groups yet"
          description="Create camp groups for this camp before arranging campers."
        >
          <form
            data-testid="scaffold-form"
            onSubmit={(e) => {
              e.preventDefault();
              scaffoldGroups();
            }}
            className="flex flex-wrap items-end justify-center gap-3"
          >
            <label className="flex flex-col items-start gap-1 text-xs text-ink-muted">
              Number of camp groups
              <input
                data-testid="scaffold-count"
                type="number"
                min={1}
                max={26}
                required
                value={scaffoldCount}
                onChange={(e) => setScaffoldCount(Number(e.target.value))}
                className="w-24 border border-border rounded-md px-2 py-1 bg-paper text-ink text-sm"
              />
            </label>
            <label className="flex flex-col items-start gap-1 text-xs text-ink-muted">
              Max group size (optional)
              <input
                data-testid="scaffold-max-size"
                type="number"
                min={1}
                value={scaffoldMaxSize}
                onChange={(e) =>
                  setScaffoldMaxSize(e.target.value === "" ? "" : Number(e.target.value))
                }
                className="w-24 border border-border rounded-md px-2 py-1 bg-paper text-ink text-sm"
              />
            </label>
            <button
              type="submit"
              data-testid="scaffold-submit"
              disabled={scaffolding}
              className="text-xs font-semibold tracking-wide uppercase bg-ink text-cream hover:bg-primary-bright hover:text-primary-foreground px-3 py-2 rounded-md transition-colors disabled:opacity-50"
            >
              {scaffolding ? "Creating…" : "Create camp groups"}
            </button>
          </form>
          {scaffoldError && (
            <ErrorBanner
              message={scaffoldError}
              onDismiss={() => setScaffoldError(null)}
              className="mt-3 text-left"
            />
          )}
        </EmptyState>
      ) : (
        <>
          {/* Controls */}
          <div className="flex flex-wrap items-end gap-3 mb-5">
            <label className="flex flex-col items-start gap-1 text-xs text-ink-muted">
              Formation strategy
              <select
                data-testid="strategy-picker"
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as FormationStrategy)}
                className="border border-border rounded-md px-2 py-1.5 bg-paper text-ink text-sm"
              >
                <option value="age">By age</option>
                <option value="skill">By skill</option>
                <option value="manual">Manual</option>
              </select>
            </label>
            <button
              type="button"
              data-testid="auto-arrange"
              onClick={autoArrange}
              disabled={strategy === "manual" || data.candidates.length === 0}
              title={
                strategy === "manual"
                  ? "Manual strategy — assign campers below, or pick an automatic strategy."
                  : undefined
              }
              className="text-xs font-semibold tracking-wide uppercase border border-ink text-ink hover:bg-ink hover:text-cream px-3 py-2 rounded-md transition-colors disabled:opacity-50"
            >
              Auto-arrange
            </button>
            <button
              type="button"
              data-testid="publish-pods"
              onClick={publish}
              disabled={publishing || Object.keys(assignments).length === 0}
              className="text-xs font-semibold tracking-wide uppercase bg-ink text-cream hover:bg-primary-bright hover:text-primary-foreground px-3 py-2 rounded-md transition-colors disabled:opacity-50"
            >
              {publishing ? "Publishing…" : "Publish camp groups"}
            </button>
          </div>

          {publishErrorMessage && (
            <ErrorBanner
              message={publishErrorMessage}
              onDismiss={() => setPublishErrors(null)}
              className="mb-4 whitespace-pre-line"
            />
          )}

          {unplacedNames.length > 0 && (
            <div
              data-testid="unplaced-banner"
              className="rounded-md border border-amber-400 bg-amber-50 text-amber-800 text-sm px-3 py-2 mb-4"
            >
              No room yet for: {unplacedNames.join(", ")}. Add a camp group or raise a group size,
              then re-arrange.
            </div>
          )}

          {/* Camp-group columns: draft counts vs caps. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {data.pods.map((pod) => {
              const draftedHere = data.candidates.filter(
                (c) => assignments[c.registrationId] === pod.teamId,
              );
              const over = pod.maxRosterSize != null && draftedHere.length > pod.maxRosterSize;
              return (
                <div
                  key={pod.teamId}
                  data-testid="pod-column"
                  data-team-id={pod.teamId}
                  className="border border-border rounded-lg p-3 bg-paper"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-sm font-semibold text-ink truncate">{pod.name}</span>
                  </div>
                  <div
                    data-testid="pod-count"
                    className={"text-sm font-display mb-2 " + (over ? "text-amber-700" : "text-ink")}
                  >
                    {draftedHere.length}
                    {pod.maxRosterSize != null ? ` / ${pod.maxRosterSize}` : ""}
                  </div>
                  {draftedHere.length > 0 && (
                    <ul className="text-xs text-ink-muted space-y-0.5">
                      {draftedHere.map((c) => (
                        <li key={c.registrationId}>{camperLabel(c.registrationId)}</li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>

          {/* Camper rows: EVERY confirmed camper in this camp (full-replace —
              already-grouped campers are movable too). */}
          {data.candidates.length === 0 ? (
            <EmptyState
              title="No campers yet"
              description="Confirmed camp registrations will appear here, ready to arrange into camp groups."
            />
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              {data.candidates.map((c) => {
                const age = ageFromBirthDate(c.birthDate);
                return (
                  <div
                    key={c.registrationId}
                    data-testid="camper-row"
                    data-registration-id={c.registrationId}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <span className="text-sm text-ink truncate">{c.childName}</span>
                      {age != null && <span className="text-xs text-ink-muted"> · {age}</span>}
                      {c.skillScore != null && (
                        <span className="text-xs text-ink-muted">
                          {" "}
                          · Skill {c.skillScore.toFixed(1)}
                        </span>
                      )}
                      {unplacedIds.includes(c.registrationId) && (
                        <span
                          data-testid="unplaced-flag"
                          className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 font-semibold"
                        >
                          No camp group available
                        </span>
                      )}
                    </div>
                    <select
                      aria-label={`Camp group for ${c.childName}`}
                      value={assignments[c.registrationId] ?? ""}
                      onChange={(e) => setAssignment(c.registrationId, e.target.value)}
                      className="border border-border rounded-md px-2 py-1 bg-paper text-ink text-sm shrink-0"
                    >
                      <option value="">Unassigned</option>
                      {data.pods.map((pod) => (
                        <option key={pod.teamId} value={pod.teamId}>
                          {pod.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
