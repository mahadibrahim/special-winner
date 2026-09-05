"use client";

/**
 * Task P4 of the 2026-09-05-league-ops-phase2 plan: the roster placement
 * planner island. Mirrors the day-planner.tsx pattern (draft in local React
 * state → explicit batch save) rather than persisting anything on every
 * click.
 *
 * Data flow:
 * - GET /api/admin/seasons/:id/placement (P3) supplies the season's teams
 *   (with published `currentCount` + coach) and the pool of confirmed,
 *   unrostered registrations ("unplaced").
 * - "Auto-draft" runs `draftPlacements` (pure, client-side — P1) over that
 *   snapshot and holds the result in `assignments` state. Nothing is
 *   written until publish.
 * - "Publish placements" POSTs the current `assignments` map to
 *   POST /api/admin/seasons/:id/placements (P3), which is transactional and
 *   all-or-nothing. A 422 returns a per-registration error list; the draft
 *   is left exactly as it was so the admin can fix and retry.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import {
  draftPlacements,
  type PlacementRegistration,
  type PlacementTeam,
} from "@/lib/leagues/draft-placements";

interface SeasonInfo {
  id: string;
  name: string;
  ageGroupName: string | null;
  divisionGender: string | null;
  skillLevel: string | null;
  audienceType: string;
}
interface TeamRow {
  teamId: string;
  name: string;
  currentCount: number;
  maxRosterSize: number | null;
  coachUserId: string | null;
  coachName: string | null;
}
interface UnplacedRow {
  registrationId: string;
  familyMemberId: string;
  birthDate: string | null;
  gender: string | null;
  childName: string;
  age: number | null;
}
interface PlacementData {
  season: SeasonInfo;
  teams: TeamRow[];
  unplaced: UnplacedRow[];
}
interface PublishError {
  registrationId: string;
  reason: string;
}

export function PlacementPlanner({
  seasonId,
  seasonName,
}: {
  seasonId: string;
  seasonName: string;
}) {
  useHydrationBeacon();

  const [data, setData] = useState<PlacementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Draft state only — nothing here is persisted until publish() succeeds.
  const [assignments, setAssignments] = useState<Record<string, string>>({});
  const [unplaceableIds, setUnplaceableIds] = useState<Set<string>>(new Set());

  const [publishing, setPublishing] = useState(false);
  const [publishErrors, setPublishErrors] = useState<PublishError[] | null>(null);

  // F2 fix (post-review): the zero-team EmptyState used to dead-end at "Back
  // to season hub" with no way to actually create teams — the admin had to
  // know the scaffold endpoint existed and hit it out-of-band. This inline
  // form calls the same POST /api/admin/seasons/:id/teams/scaffold endpoint
  // the API tests cover (tests/api/leagues/placement.test.ts), then refetches
  // the placement GET so the newly-created teams appear immediately.
  const [scaffoldCount, setScaffoldCount] = useState(4);
  const [scaffoldMaxRosterSize, setScaffoldMaxRosterSize] = useState<number | "">(12);
  const [scaffolding, setScaffolding] = useState(false);
  const [scaffoldError, setScaffoldError] = useState<string | null>(null);

  async function scaffoldTeams() {
    setScaffolding(true);
    setScaffoldError(null);
    try {
      const res = await fetch(`/api/admin/seasons/${seasonId}/teams/scaffold`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          count: scaffoldCount,
          maxRosterSize: scaffoldMaxRosterSize === "" ? null : scaffoldMaxRosterSize,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to create teams (${res.status})`);
      }
      toast.success("Teams created.");
      await loadPlacementData();
    } catch (e) {
      setScaffoldError(e instanceof Error ? e.message : "Failed to create teams.");
    } finally {
      setScaffolding(false);
    }
  }

  async function loadPlacementData() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/seasons/${seasonId}/placement`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Failed to load placement data (${res.status})`);
      }
      const body: PlacementData = await res.json();
      setData(body);
      setAssignments({});
      setUnplaceableIds(new Set());
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load placement data.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPlacementData();
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
    setUnplaceableIds((prev) => {
      if (!prev.has(registrationId)) return prev;
      const next = new Set(prev);
      next.delete(registrationId);
      return next;
    });
  }

  function autoDraft() {
    if (!data) return;
    const regs: PlacementRegistration[] = data.unplaced.map((r) => ({
      registrationId: r.registrationId,
      familyMemberId: r.familyMemberId,
      birthDate: r.birthDate,
      gender: r.gender,
    }));
    const teamsForDraft: PlacementTeam[] = data.teams.map((t) => ({
      teamId: t.teamId,
      name: t.name,
      currentCount: t.currentCount,
      maxRosterSize: t.maxRosterSize,
    }));
    const result = draftPlacements(regs, teamsForDraft);
    const next: Record<string, string> = {};
    for (const a of result.assignments) next[a.registrationId] = a.teamId;
    setAssignments(next);
    setUnplaceableIds(new Set(result.unplaced));

    if (result.unplaced.length > 0) {
      toast.error(
        `${result.unplaced.length} player${result.unplaced.length === 1 ? "" : "s"} could not be placed — every team is full.`,
      );
    } else if (result.assignments.length > 0) {
      toast.success("Draft placements generated. Review, then publish.");
    }
  }

  async function publish() {
    if (!data) return;
    const assignmentPayload = Object.entries(assignments).map(([registrationId, teamId]) => ({
      registrationId,
      teamId,
    }));
    if (assignmentPayload.length === 0) {
      toast.error("Assign at least one player before publishing.");
      return;
    }

    setPublishing(true);
    setPublishErrors(null);
    try {
      const res = await fetch(`/api/admin/seasons/${seasonId}/placements`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignments: assignmentPayload }),
      });

      if (res.status === 422) {
        const body = await res.json().catch(() => ({}));
        const errors: PublishError[] = Array.isArray(body.errors)
          ? body.errors
          : [{ registrationId: "", reason: body.error ?? "Validation failed." }];
        // Draft is intentionally left untouched — the admin can fix the
        // flagged rows and retry without redoing the whole auto-draft.
        setPublishErrors(errors);
        toast.error("Some placements could not be published — draft preserved.");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Publish failed (${res.status})`);
      }

      toast.success("Placements published.");
      await loadPlacementData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  const publishErrorMessage =
    publishErrors && publishErrors.length > 0
      ? publishErrors
          .map((e) => {
            const child = data?.unplaced.find((u) => u.registrationId === e.registrationId);
            const label = child?.childName ?? (e.registrationId || "Request");
            return `${label}: ${e.reason}`;
          })
          .join("\n")
      : null;

  const isCompetitive = Boolean(data?.season.skillLevel?.startsWith("competitive"));

  return (
    <div data-testid="placement-planner" className="max-w-5xl mx-auto p-4 sm:p-6">
      <header className="mb-6">
        <a href={`/admin/seasons/${seasonId}`} className="text-xs text-ink-muted hover:text-ink">
          ← {seasonName}
        </a>
        <h1 className="font-display text-2xl text-ink mt-1">Roster Placement Planner</h1>
        <p className="text-sm text-ink-muted">
          Draft team assignments, then publish. Nothing is saved until you hit Publish.
        </p>
      </header>

      {loadError && <ErrorBanner message={loadError} className="mb-4" />}

      {loading || !data ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <>
          {isCompetitive && (
            <div className="rounded-md border border-amber-400 bg-amber-50 text-amber-800 text-sm px-3 py-2 mb-4">
              Heads up — this is a competitive season. Double-check skill balance before
              publishing.
            </div>
          )}

          {data.teams.length === 0 ? (
            <EmptyState
              title="No teams yet"
              description="Create teams for this season before placing players."
            >
              <form
                data-testid="scaffold-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  scaffoldTeams();
                }}
                className="flex flex-wrap items-end justify-center gap-3"
              >
                <label className="flex flex-col items-start gap-1 text-xs text-ink-muted">
                  Number of teams
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
                  Max roster size (optional)
                  <input
                    data-testid="scaffold-max-roster-size"
                    type="number"
                    min={1}
                    value={scaffoldMaxRosterSize}
                    onChange={(e) =>
                      setScaffoldMaxRosterSize(e.target.value === "" ? "" : Number(e.target.value))
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
                  {scaffolding ? "Creating…" : "Create teams"}
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
              <div className="flex flex-wrap items-center gap-3 mb-5">
                <button
                  type="button"
                  data-testid="auto-draft"
                  onClick={autoDraft}
                  disabled={data.unplaced.length === 0}
                  className="text-xs font-semibold tracking-wide uppercase border border-ink text-ink hover:bg-ink hover:text-cream px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  Auto-draft
                </button>
                <button
                  type="button"
                  data-testid="publish-placements"
                  onClick={publish}
                  disabled={publishing || Object.keys(assignments).length === 0}
                  className="text-xs font-semibold tracking-wide uppercase bg-ink text-cream hover:bg-primary-bright hover:text-primary-foreground px-3 py-2 rounded-md transition-colors disabled:opacity-50"
                >
                  {publishing ? "Publishing…" : "Publish placements"}
                </button>
              </div>

              {publishErrorMessage && (
                <ErrorBanner
                  message={publishErrorMessage}
                  onDismiss={() => setPublishErrors(null)}
                  className="mb-4 whitespace-pre-line"
                />
              )}

              {/* Per-team columns: live counts vs caps, coach or "No coach" chip. */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
                {data.teams.map((t) => {
                  const draftedHere = data.unplaced.filter(
                    (r) => assignments[r.registrationId] === t.teamId,
                  );
                  const total = t.currentCount + draftedHere.length;
                  const over = t.maxRosterSize != null && total > t.maxRosterSize;
                  return (
                    <div
                      key={t.teamId}
                      data-testid="team-column"
                      data-team-id={t.teamId}
                      className="border border-border rounded-lg p-3 bg-paper"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-semibold text-ink truncate">{t.name}</span>
                        {t.coachName ? (
                          <span className="text-[11px] text-ink-muted truncate">
                            {t.coachName}
                          </span>
                        ) : (
                          <span
                            data-testid="no-coach-chip"
                            className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full border border-border text-ink-muted shrink-0"
                          >
                            No coach
                          </span>
                        )}
                      </div>
                      <div
                        data-testid="team-count"
                        className={
                          "text-sm font-display mb-2 " + (over ? "text-amber-700" : "text-ink")
                        }
                      >
                        {total}
                        {t.maxRosterSize != null ? ` / ${t.maxRosterSize}` : ""}
                      </div>
                      {draftedHere.length > 0 && (
                        <ul className="text-xs text-ink-muted space-y-0.5">
                          {draftedHere.map((r) => (
                            <li key={r.registrationId}>{r.childName}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Placement rows: every confirmed, unrostered registration in
                  this season, with a select for manual team adjustment. */}
              {data.unplaced.length === 0 ? (
                <EmptyState
                  title="All players placed"
                  description="Every confirmed registration in this season is already on a roster."
                />
              ) : (
                <div className="border border-border rounded-lg divide-y divide-border">
                  {data.unplaced.map((r) => (
                    <div
                      key={r.registrationId}
                      data-testid="placement-row"
                      data-registration-id={r.registrationId}
                      className="flex items-center justify-between gap-3 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <span className="text-sm text-ink truncate">{r.childName}</span>
                        {r.age != null && (
                          <span className="text-xs text-ink-muted"> · Age {r.age}</span>
                        )}
                        {r.gender && <span className="text-xs text-ink-muted"> · {r.gender}</span>}
                        {unplaceableIds.has(r.registrationId) && (
                          <span
                            data-testid="unplaceable-flag"
                            className="ml-2 text-[10px] uppercase tracking-wide text-amber-700 font-semibold"
                          >
                            No team available
                          </span>
                        )}
                      </div>
                      <select
                        aria-label={`Team for ${r.childName}`}
                        value={assignments[r.registrationId] ?? ""}
                        onChange={(e) => setAssignment(r.registrationId, e.target.value)}
                        className="border border-border rounded-md px-2 py-1 bg-paper text-ink text-sm shrink-0"
                      >
                        <option value="">Unassigned</option>
                        {data.teams.map((t) => (
                          <option key={t.teamId} value={t.teamId}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
