"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { groupSpacesByLocation } from "@/lib/admin/group-spaces";
import { toast } from "sonner";

interface VenueOption {
  id: string;
  name: string;
  location: { id: string; name: string };
}

interface SessionFormProps {
  /** Existing session id to edit; falsy = create. */
  sessionId?: string;
}

interface FormState {
  venueId: string;
  bookableResourceId: string;
  kind: "pickup" | "class";
  sportOrClassLabel: string;
  formatLabel: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  capacityMale: string;
  capacityFemale: string;
  skillLevel: "recreational" | "intermediate" | "advanced" | "all_levels";
  audience: "adults" | "youth" | "all_ages";
  membersOnly: boolean;
  sessionRateCents: string;
  memberRateCents: string;
  walkUpRateCents: string;
  teamCount: number;
  teamColors: string;
}

const EMPTY: FormState = {
  venueId: "",
  bookableResourceId: "",
  kind: "pickup",
  sportOrClassLabel: "",
  formatLabel: "",
  startsAt: "",
  endsAt: "",
  capacity: 16,
  capacityMale: "",
  capacityFemale: "",
  skillLevel: "all_levels",
  audience: "adults",
  membersOnly: false,
  sessionRateCents: "",
  memberRateCents: "",
  walkUpRateCents: "",
  teamCount: 0,
  teamColors: "",
};

function localIso(d: Date): string {
  // Convert a Date to a local-time string matching <input type="datetime-local"> shape.
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 16);
}

export function SessionForm({ sessionId }: SessionFormProps) {
  useHydrationBeacon();

  const [state, setState] = useState<FormState>(EMPTY);
  const [venues, setVenues] = useState<VenueOption[]>([]);
  const [resources, setResources] = useState<
    Array<{ id: string; name: string; fieldNumber: number }>
  >([]);
  const [loading, setLoading] = useState(!!sessionId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const venuesRes = await fetch("/api/admin/venues");
        if (venuesRes.ok) {
          const v = await venuesRes.json();
          setVenues(v.venues ?? v ?? []);
        }
      } catch {
        /* venues nice-to-have */
      }

      if (sessionId) {
        try {
          const res = await fetch(`/api/admin/dropin/sessions/${sessionId}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();
          const s = json.session;
          setState({
            venueId: s.venueId,
            bookableResourceId: s.bookableResourceId ?? "",
            kind: s.kind,
            sportOrClassLabel: s.sportOrClassLabel,
            formatLabel: s.formatLabel ?? "",
            startsAt: localIso(new Date(s.startsAt)),
            endsAt: localIso(new Date(s.endsAt)),
            capacity: s.capacity,
            capacityMale: s.capacityMale != null ? String(s.capacityMale) : "",
            capacityFemale:
              s.capacityFemale != null ? String(s.capacityFemale) : "",
            skillLevel: s.skillLevel,
            audience: s.audience,
            membersOnly: s.membersOnly,
            sessionRateCents:
              s.sessionRateCents != null ? String(s.sessionRateCents) : "",
            memberRateCents:
              s.memberRateCents != null ? String(s.memberRateCents) : "",
            walkUpRateCents:
              s.walkUpRateCents != null ? String(s.walkUpRateCents) : "",
            teamCount: s.teamCount,
            teamColors: (s.teamColors ?? []).join(", "),
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load");
        } finally {
          setLoading(false);
        }
      }
    })();
  }, [sessionId]);

  // Field options follow the selected venue.
  useEffect(() => {
    if (!state.venueId) {
      setResources([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/admin/venues/${state.venueId}/resources`);
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setResources(json.resources ?? []);
      } catch {
        /* picker degrades to default field */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [state.venueId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = {
        venueId: state.venueId,
        bookableResourceId: state.bookableResourceId || undefined,
        kind: state.kind,
        sportOrClassLabel: state.sportOrClassLabel,
        formatLabel: state.formatLabel || null,
        startsAt: new Date(state.startsAt).toISOString(),
        endsAt: new Date(state.endsAt).toISOString(),
        capacity: Number(state.capacity),
        capacityMale: state.capacityMale ? Number(state.capacityMale) : null,
        capacityFemale: state.capacityFemale
          ? Number(state.capacityFemale)
          : null,
        skillLevel: state.skillLevel,
        audience: state.audience,
        membersOnly: state.membersOnly,
        sessionRateCents: state.sessionRateCents
          ? Number(state.sessionRateCents)
          : null,
        memberRateCents: state.memberRateCents
          ? Number(state.memberRateCents)
          : null,
        walkUpRateCents: state.walkUpRateCents
          ? Number(state.walkUpRateCents)
          : null,
        teamCount: Number(state.teamCount),
        teamColors: state.teamColors
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const url = sessionId
        ? `/api/admin/dropin/sessions/${sessionId}`
        : "/api/admin/dropin/sessions";
      const method = sessionId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.status === 409 && json.warning) {
        // Saved, but the slot conflicts in the field-time ledger —
        // surface the blocking label so the admin can move it.
        setError(`Saved with a conflict: ${json.warning}`);
        toast.warning(json.warning);
        return;
      }
      if (!res.ok) {
        setError(json.error ?? "Save failed");
        return;
      }
      toast.success(sessionId ? "Saved" : "Created");
      const newId = sessionId ?? json.session?.id;
      if (newId) window.location.href = `/admin/dropin/sessions/${newId}`;
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-ink-muted">Loading…</p>;

  return (
    <form onSubmit={submit} className="max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink">
          {sessionId ? "Edit session" : "New drop-in session"}
        </h1>
      </header>

      {error && <ErrorBanner message={error} />}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="venue">Space</Label>
          <select
            id="venue"
            value={state.venueId}
            onChange={(e) => setState({ ...state, venueId: e.target.value, bookableResourceId: "" })}
            required
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
          >
            <option value="">Select a space…</option>
            {groupSpacesByLocation(venues).map((group) => (
              <optgroup key={group.locationName} label={group.locationName}>
                {group.spaces.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="field">Field</Label>
          <select
            id="field"
            value={state.bookableResourceId}
            onChange={(e) =>
              setState({ ...state, bookableResourceId: e.target.value })
            }
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
            disabled={!state.venueId || resources.length === 0}
          >
            <option value="">
              {resources.length === 0 ? "Field 1 (default)" : "Select a field…"}
            </option>
            {resources.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-muted">
            The session blocks this field for rentals and games.
          </p>
        </div>
        <div>
          <Label htmlFor="kind">Kind</Label>
          <select
            id="kind"
            value={state.kind}
            onChange={(e) =>
              setState({ ...state, kind: e.target.value as "pickup" | "class" })
            }
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
          >
            <option value="pickup">Pickup</option>
            <option value="class">Class</option>
          </select>
        </div>
        <div>
          <Label htmlFor="sport">Sport / class label</Label>
          <Input
            id="sport"
            value={state.sportOrClassLabel}
            onChange={(e) =>
              setState({ ...state, sportOrClassLabel: e.target.value })
            }
            placeholder="Soccer, Basketball, Yoga…"
            required
          />
        </div>
        <div>
          <Label htmlFor="format">Format (optional)</Label>
          <Input
            id="format"
            value={state.formatLabel}
            onChange={(e) =>
              setState({ ...state, formatLabel: e.target.value })
            }
            placeholder="5v5, drop-in flow…"
          />
        </div>
        <div>
          <Label htmlFor="starts">Starts</Label>
          <Input
            id="starts"
            type="datetime-local"
            value={state.startsAt}
            onChange={(e) => setState({ ...state, startsAt: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="ends">Ends</Label>
          <Input
            id="ends"
            type="datetime-local"
            value={state.endsAt}
            onChange={(e) => setState({ ...state, endsAt: e.target.value })}
            required
          />
        </div>
        <div>
          <Label htmlFor="cap">Capacity</Label>
          <Input
            id="cap"
            type="number"
            min={1}
            value={state.capacity}
            onChange={(e) =>
              setState({ ...state, capacity: Number(e.target.value) })
            }
            required
          />
        </div>
        <div>
          <Label htmlFor="capm">Male cap (optional)</Label>
          <Input
            id="capm"
            type="number"
            min={0}
            value={state.capacityMale}
            onChange={(e) =>
              setState({ ...state, capacityMale: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="capf">Female cap (optional)</Label>
          <Input
            id="capf"
            type="number"
            min={0}
            value={state.capacityFemale}
            onChange={(e) =>
              setState({ ...state, capacityFemale: e.target.value })
            }
          />
        </div>
        <div>
          <Label htmlFor="skill">Skill level</Label>
          <select
            id="skill"
            value={state.skillLevel}
            onChange={(e) =>
              setState({ ...state, skillLevel: e.target.value as FormState["skillLevel"] })
            }
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
          >
            <option value="all_levels">All levels</option>
            <option value="recreational">Recreational</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </div>
        <div>
          <Label htmlFor="aud">Audience</Label>
          <select
            id="aud"
            value={state.audience}
            onChange={(e) =>
              setState({ ...state, audience: e.target.value as FormState["audience"] })
            }
            className="mt-1 w-full rounded border border-border px-3 py-2 bg-cream"
          >
            <option value="adults">Adults</option>
            <option value="youth">Youth</option>
            <option value="all_ages">All ages</option>
          </select>
        </div>
        <div>
          <Label htmlFor="srate">Session rate (cents) — override</Label>
          <Input
            id="srate"
            type="number"
            min={0}
            value={state.sessionRateCents}
            onChange={(e) =>
              setState({ ...state, sessionRateCents: e.target.value })
            }
            placeholder="leave blank for rate-card default"
          />
        </div>
        <div>
          <Label htmlFor="mrate">Member rate (cents) — override</Label>
          <Input
            id="mrate"
            type="number"
            min={0}
            value={state.memberRateCents}
            onChange={(e) =>
              setState({ ...state, memberRateCents: e.target.value })
            }
            placeholder="leave blank for rate-card default"
          />
        </div>
        <div>
          <Label htmlFor="wuprate">Walk-up rate (cents) — override</Label>
          <Input
            id="wuprate"
            type="number"
            min={0}
            value={state.walkUpRateCents}
            onChange={(e) =>
              setState({ ...state, walkUpRateCents: e.target.value })
            }
            placeholder="leave blank for rate-card default"
          />
        </div>
        <div>
          <Label htmlFor="teamcount">Team count (0 = no teams)</Label>
          <Input
            id="teamcount"
            type="number"
            min={0}
            value={state.teamCount}
            onChange={(e) =>
              setState({ ...state, teamCount: Number(e.target.value) })
            }
          />
        </div>
        <div>
          <Label htmlFor="colors">Team colors (comma separated)</Label>
          <Input
            id="colors"
            value={state.teamColors}
            onChange={(e) => setState({ ...state, teamColors: e.target.value })}
            placeholder="Orange, Black"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={state.membersOnly}
          onChange={(e) =>
            setState({ ...state, membersOnly: e.target.checked })
          }
        />
        Members only
      </label>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : sessionId ? "Save changes" : "Create session"}
        </Button>
        <Button
          type="button"
          variant="outline"
          asChild
          disabled={busy}
        >
          <a
            href={
              sessionId ? `/admin/dropin/sessions/${sessionId}` : "/admin/dropin/sessions"
            }
          >
            Cancel
          </a>
        </Button>
      </div>
    </form>
  );
}
