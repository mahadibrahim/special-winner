"use client";

import { useEffect, useMemo, useState } from "react";
import { SessionCard, type SessionCardData } from "./SessionCard";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { Badge } from "@/components/ui/badge";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

const SKILLS = ["recreational", "intermediate", "advanced", "all_levels"] as const;
const AUDIENCES = ["adults", "youth", "all_ages"] as const;

type Skill = (typeof SKILLS)[number];
type Audience = (typeof AUDIENCES)[number];

interface ApiResponse {
  sessions: SessionCardData[];
  defaults: {
    defaultSessionRateCents: number;
    defaultMemberRateCents: number;
  } | null;
}

function ChipFilter<T extends string>({
  label,
  options,
  selected,
  onToggle,
  formatOption,
}: {
  label: string;
  options: readonly T[];
  selected: Set<T>;
  onToggle: (v: T) => void;
  formatOption?: (v: T) => string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wider text-stone-500">
        {label}
      </span>
      {options.map((opt) => {
        const isSelected = selected.has(opt);
        return (
          <button
            type="button"
            key={opt}
            onClick={() => onToggle(opt)}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${
              isSelected
                ? "bg-stone-900 text-white border-stone-900"
                : "bg-white text-stone-700 border-stone-300 hover:border-stone-500"
            }`}
          >
            {formatOption ? formatOption(opt) : opt.replace("_", " ")}
          </button>
        );
      })}
    </div>
  );
}

export default function SessionList() {
  useHydrationBeacon();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [skills, setSkills] = useState<Set<Skill>>(new Set());
  const [audiences, setAudiences] = useState<Set<Audience>>(new Set());
  const [sport, setSport] = useState<string>("");
  const [venueId, setVenueId] = useState<string>("");

  useEffect(() => {
    const fetchSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (sport) params.set("sport", sport);
        if (venueId) params.set("venue", venueId);
        // Filters with multi-select are applied client-side because the
        // GET endpoint takes a single value per filter — keeps the cache
        // story simple. UX-wise this is the same since the result set is
        // small (<200 rows for a 14-day window).
        const res = await fetch(`/api/dropin/sessions?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as ApiResponse;
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void fetchSessions();
  }, [sport, venueId]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.sessions.filter((s) => {
      if (skills.size > 0 && !skills.has(s.skillLevel as Skill)) return false;
      if (audiences.size > 0 && !audiences.has(s.audience as Audience)) return false;
      return true;
    });
  }, [data, skills, audiences]);

  const sportsAvailable = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set(data.sessions.map((s) => s.sportOrClassLabel))).sort();
  }, [data]);

  const venuesAvailable = useMemo(() => {
    if (!data) return [] as { id: string; name: string }[];
    const map = new Map<string, string>();
    for (const s of data.sessions) {
      if (s.venueName) map.set((s as unknown as { venueId: string }).venueId, s.venueName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [data]);

  const toggle = <T extends string>(set: Set<T>, val: T): Set<T> => {
    const next = new Set(set);
    if (next.has(val)) next.delete(val);
    else next.add(val);
    return next;
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold text-stone-900">Drop in</h1>
        <p className="mt-1 text-stone-600">
          Pick-up games and classes — book your spot.
        </p>
      </header>

      <div className="space-y-3 rounded-xl bg-stone-50 p-4 border border-stone-200">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs uppercase tracking-wider text-stone-500">
            Sport
            <select
              value={sport}
              onChange={(e) => setSport(e.target.value)}
              className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm normal-case tracking-normal"
            >
              <option value="">All</option>
              {sportsAvailable.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs uppercase tracking-wider text-stone-500">
            Venue
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="ml-2 rounded border border-stone-300 px-2 py-1 text-sm normal-case tracking-normal"
            >
              <option value="">All</option>
              {venuesAvailable.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ChipFilter
          label="Skill"
          options={SKILLS}
          selected={skills}
          onToggle={(v) => setSkills(toggle(skills, v))}
        />
        <ChipFilter
          label="Audience"
          options={AUDIENCES}
          selected={audiences}
          onToggle={(v) => setAudiences(toggle(audiences, v))}
        />
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <Badge variant="outline">{filtered.length} sessions</Badge>
          {(skills.size > 0 || audiences.size > 0 || sport || venueId) && (
            <button
              type="button"
              onClick={() => {
                setSkills(new Set());
                setAudiences(new Set());
                setSport("");
                setVenueId("");
              }}
              className="text-stone-700 underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      {loading && <LoadingSkeleton />}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          title="No sessions match"
          description="Try clearing filters or check back later for the next 14 days of sessions."
        />
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              defaultSessionRateCents={
                data?.defaults?.defaultSessionRateCents ?? null
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
