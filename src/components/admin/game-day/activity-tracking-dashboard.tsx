"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, X, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

interface Row {
  id: string;
  organizationId: string;
  gameId: string;
  activityId: string;
  expectedAt: string;
  status:
    | "pending"
    | "in_progress"
    | "overdue"
    | "completed"
    | "canceled"
    | "skipped_by_handoff";
  currentResponsibleRole: string;
  completedAt: string | null;
  gameScheduledAt: string;
  venueId: string | null;
  venueName: string | null;
}

interface CatalogActivity {
  id: string;
  name: string;
  phase: Phase;
  raci: { responsible: string[] };
}

type Phase =
  | "pre_day"
  | "day_setup"
  | "pre_game"
  | "in_game"
  | "post_game"
  | "end_of_day"
  | "post_day";

const PHASES: Phase[] = [
  "pre_day",
  "day_setup",
  "pre_game",
  "in_game",
  "post_game",
  "end_of_day",
  "post_day",
];

const PHASE_LABELS: Record<Phase, string> = {
  pre_day: "Pre-day",
  day_setup: "Day setup",
  pre_game: "Pre-game",
  in_game: "In-game",
  post_game: "Post-game",
  end_of_day: "End of day",
  post_day: "Post-day",
};

const STATUSES: Row["status"][] = [
  "pending",
  "in_progress",
  "overdue",
  "completed",
  "canceled",
  "skipped_by_handoff",
];

const STATUS_COLORS: Record<Row["status"], string> = {
  pending: "bg-gray-100 text-gray-800 border-gray-200",
  in_progress: "bg-blue-100 text-blue-800 border-blue-200",
  overdue: "bg-yellow-100 text-yellow-900 border-yellow-300",
  completed: "bg-green-100 text-green-800 border-green-200",
  canceled: "bg-red-100 text-red-800 border-red-200",
  skipped_by_handoff: "bg-purple-100 text-purple-800 border-purple-200",
};

function todayUtcIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function StatusBadge({ status }: { status: Row["status"] }) {
  return (
    <Badge variant="outline" className={`${STATUS_COLORS[status]} font-normal`}>
      {status}
    </Badge>
  );
}

/** A small multi-select pill list. Click to toggle. */
function PillSelect<T extends string>({
  label,
  options,
  selected,
  onToggle,
  formatOption,
}: {
  label: string;
  options: T[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  formatOption?: (v: T) => string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => {
              for (const v of Array.from(selected)) onToggle(v);
            }}
            className="text-xs text-muted-foreground hover:underline"
          >
            clear
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {options.map((opt) => {
          const active = selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
              }`}
            >
              {formatOption ? formatOption(opt) : opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface FiltersState {
  venues: Set<string>;
  phases: Set<Phase>;
  statuses: Set<Row["status"]>;
  roles: Set<string>;
  search: string;
}

const EMPTY_FILTERS: FiltersState = {
  venues: new Set(),
  phases: new Set(),
  statuses: new Set(),
  roles: new Set(),
  search: "",
};

export function ActivityTrackingDashboard() {
  useHydrationBeacon();

  const [date, setDate] = useState<string>(todayUtcIso());
  const [includeClosed, setIncludeClosed] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [activities, setActivities] = useState<CatalogActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [filters, setFilters] = useState<FiltersState>(EMPTY_FILTERS);
  const [tab, setTab] = useState<"by_time" | "by_phase">("by_time");

  useEffect(() => {
    void fetchActivities();
    // catalog is immutable per process; only fetch once.
  }, []);

  useEffect(() => {
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, includeClosed]);

  async function fetchActivities() {
    try {
      const res = await fetch("/api/catalog/activities");
      if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
      const body = await res.json();
      setActivities(body.activities ?? []);
    } catch (err) {
      console.error(err);
      // Don't surface to UI — by-phase tab will fall back to "Unknown phase".
    }
  }

  async function fetchRows() {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ date });
      if (includeClosed) params.set("includeClosed", "1");
      const res = await fetch(`/api/admin/activity-completions/today?${params}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const body = await res.json();
      setRows(body.rows ?? []);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setIsLoading(false);
    }
  }

  // Build lookup maps from the catalog.
  const activityById = useMemo(() => {
    const m = new Map<string, CatalogActivity>();
    for (const a of activities) m.set(a.id, a);
    return m;
  }, [activities]);

  // Distinct values from current rows for filter pickers.
  const allVenues = useMemo(() => {
    const m = new Map<string, string>(); // id → name
    for (const r of rows ?? []) {
      if (r.venueId) m.set(r.venueId, r.venueName ?? r.venueId);
    }
    return Array.from(m.entries());
  }, [rows]);

  const allRoles = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows ?? []) s.add(r.currentResponsibleRole);
    return Array.from(s).sort();
  }, [rows]);

  // Apply filters.
  const filtered = useMemo(() => {
    if (!rows) return [];
    const search = filters.search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filters.venues.size && (!r.venueId || !filters.venues.has(r.venueId))) {
        return false;
      }
      if (filters.statuses.size && !filters.statuses.has(r.status)) {
        return false;
      }
      if (filters.roles.size && !filters.roles.has(r.currentResponsibleRole)) {
        return false;
      }
      if (filters.phases.size) {
        const phase = activityById.get(r.activityId)?.phase;
        if (!phase || !filters.phases.has(phase)) return false;
      }
      if (search) {
        const activity = activityById.get(r.activityId);
        const haystack = `${r.activityId} ${activity?.name ?? ""}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }, [rows, filters, activityById]);

  // Group by phase for the by-phase tab.
  const groupedByPhase = useMemo(() => {
    const groups = new Map<Phase | "unknown", Row[]>();
    for (const r of filtered) {
      const phase = activityById.get(r.activityId)?.phase ?? ("unknown" as const);
      const arr = groups.get(phase) ?? [];
      arr.push(r);
      groups.set(phase, arr);
    }
    // Order by canonical phase order, then unknown.
    const ordered: Array<[Phase | "unknown", Row[]]> = [];
    for (const p of PHASES) {
      const arr = groups.get(p);
      if (arr && arr.length) ordered.push([p, arr]);
    }
    const unknown = groups.get("unknown");
    if (unknown && unknown.length) ordered.push(["unknown", unknown]);
    return ordered;
  }, [filtered, activityById]);

  function toggleSet<T>(setter: (next: Set<T>) => void, current: Set<T>, value: T) {
    const next = new Set(current);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setter(next);
  }

  const totalFiltersActive =
    filters.venues.size +
    filters.phases.size +
    filters.statuses.size +
    filters.roles.size +
    (filters.search ? 1 : 0);

  // Filter panel (rendered inline on desktop, inside Sheet on mobile).
  const filterPanel = (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="search" className="text-xs">Search activity</Label>
        <Input
          id="search"
          placeholder="e.g. facility unlock"
          value={filters.search}
          onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          autoComplete="off"
        />
      </div>

      <PillSelect
        label="Phase"
        options={PHASES}
        selected={filters.phases}
        onToggle={(v) => setFilters((f) => ({ ...f, phases: toggle(f.phases, v) }))}
        formatOption={(v) => PHASE_LABELS[v]}
      />

      <PillSelect
        label="Status"
        options={STATUSES}
        selected={filters.statuses}
        onToggle={(v) => setFilters((f) => ({ ...f, statuses: toggle(f.statuses, v) }))}
      />

      {allVenues.length > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Venue</Label>
            {filters.venues.size > 0 && (
              <button
                type="button"
                onClick={() => setFilters((f) => ({ ...f, venues: new Set() }))}
                className="text-xs text-muted-foreground hover:underline"
              >
                clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {allVenues.map(([id, name]) => {
              const active = filters.venues.has(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() =>
                    setFilters((f) => ({ ...f, venues: toggle(f.venues, id) }))
                  }
                  className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {allRoles.length > 0 && (
        <PillSelect
          label="Responsible role"
          options={allRoles}
          selected={filters.roles}
          onToggle={(v) => setFilters((f) => ({ ...f, roles: toggle(f.roles, v) }))}
        />
      )}

      {totalFiltersActive > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setFilters(EMPTY_FILTERS)}
          className="w-full"
        >
          <X className="h-4 w-4 mr-2" />
          Clear all filters
        </Button>
      )}
    </div>
  );

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900">Today's activities</h1>
          <p className="text-gray-600 mt-1 text-sm">
            All tracked work for {date} (UTC)
            {filtered.length !== (rows?.length ?? 0) && (
              <> · {filtered.length} of {rows?.length ?? 0} shown</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="date" className="text-xs">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="includeClosed"
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="includeClosed" className="text-sm font-normal">
              Include closed
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchRows()} disabled={isLoading}>
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>

          {/* Mobile filters trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="md:hidden">
                <SlidersHorizontal className="h-4 w-4 mr-2" />
                Filters
                {totalFiltersActive > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 px-1.5">
                    {totalFiltersActive}
                  </Badge>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[85vw] max-w-sm overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
                <SheetDescription>Narrow the activity list</SheetDescription>
              </SheetHeader>
              <div className="mt-4">{filterPanel}</div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 md:grid-cols-[16rem_1fr] gap-4">
        {/* Desktop sidebar filters */}
        <aside className="hidden md:block bg-white border rounded-lg p-4 h-fit sticky top-4">
          {filterPanel}
        </aside>

        <div className="min-w-0">
          {rows === null ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title={
                (rows?.length ?? 0) === 0
                  ? "No activities for this date"
                  : "No activities match the current filters"
              }
              description={
                (rows?.length ?? 0) === 0
                  ? "Activities are bootstrapped when games are scheduled. Check the date filter or include closed."
                  : "Try clearing some filters to see more rows."
              }
            />
          ) : (
            <Tabs value={tab} onValueChange={(v) => setTab(v as "by_time" | "by_phase")}>
              <TabsList>
                <TabsTrigger value="by_time">By time</TabsTrigger>
                <TabsTrigger value="by_phase">By phase</TabsTrigger>
              </TabsList>

              <TabsContent value="by_time" className="mt-3">
                <FlatTable rows={filtered} activityById={activityById} />
                <CardList rows={filtered} activityById={activityById} />
              </TabsContent>

              <TabsContent value="by_phase" className="mt-3 space-y-4">
                {groupedByPhase.map(([phase, group]) => (
                  <section key={phase}>
                    <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700 mb-2">
                      {phase === "unknown" ? "Unknown phase" : PHASE_LABELS[phase as Phase]}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        ({group.length})
                      </span>
                    </h2>
                    <FlatTable rows={group} activityById={activityById} />
                    <CardList rows={group} activityById={activityById} />
                  </section>
                ))}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </div>
  );
}

function toggle<T>(s: Set<T>, v: T): Set<T> {
  const next = new Set(s);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

function ActivityCell({
  row,
  activityById,
}: {
  row: Row;
  activityById: Map<string, CatalogActivity>;
}) {
  const activity = activityById.get(row.activityId);
  return (
    <div>
      <div className="font-medium">{activity?.name ?? row.activityId}</div>
      <div className="text-xs text-muted-foreground font-mono">{row.activityId}</div>
    </div>
  );
}

/** Desktop / md+ flat table view. Hidden on small screens. */
function FlatTable({
  rows,
  activityById,
}: {
  rows: Row[];
  activityById: Map<string, CatalogActivity>;
}) {
  return (
    <div className="hidden md:block overflow-x-auto rounded-lg border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          <tr>
            <th className="px-3 py-2 font-medium">Status</th>
            <th className="px-3 py-2 font-medium">Activity</th>
            <th className="px-3 py-2 font-medium">Venue</th>
            <th className="px-3 py-2 font-medium">Expected</th>
            <th className="px-3 py-2 font-medium">Responsible</th>
            <th className="px-3 py-2 font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.id} className="hover:bg-gray-50">
              <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
              <td className="px-3 py-2"><ActivityCell row={r} activityById={activityById} /></td>
              <td className="px-3 py-2">{r.venueName ?? "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {new Date(r.expectedAt).toLocaleString()}
              </td>
              <td className="px-3 py-2 font-mono text-xs">{r.currentResponsibleRole}</td>
              <td className="px-3 py-2 text-right">
                <a
                  href={`/admin/activity-completions/${r.id}`}
                  className="text-primary hover:underline whitespace-nowrap"
                >
                  Open →
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mobile / sub-md card list. Hidden on md+ screens. */
function CardList({
  rows,
  activityById,
}: {
  rows: Row[];
  activityById: Map<string, CatalogActivity>;
}) {
  return (
    <div className="md:hidden space-y-2">
      {rows.map((r) => {
        const activity = activityById.get(r.activityId);
        return (
          <a
            key={r.id}
            href={`/admin/activity-completions/${r.id}`}
            className="block bg-white border rounded-lg p-3 hover:bg-gray-50 transition-colors"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="font-medium leading-tight">
                {activity?.name ?? r.activityId}
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="text-xs text-muted-foreground font-mono mb-2">
              {r.activityId}
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <div className="text-muted-foreground">Venue</div>
                <div className="font-medium">{r.venueName ?? "—"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Expected</div>
                <div className="font-medium">
                  {new Date(r.expectedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground">Responsible</div>
                <div className="font-mono">{r.currentResponsibleRole}</div>
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}
