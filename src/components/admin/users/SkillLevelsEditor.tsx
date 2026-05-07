"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface SkillRow {
  userId: string;
  sport: string;
  level: "recreational" | "intermediate" | "advanced";
  source: "self_reported" | "admin_assigned";
  setAt: string;
}

interface SkillLevelsEditorProps {
  userId: string;
}

const LEVELS = ["recreational", "intermediate", "advanced"] as const;

export function SkillLevelsEditor({ userId }: SkillLevelsEditorProps) {
  useHydrationBeacon();

  const [rows, setRows] = useState<SkillRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newSport, setNewSport] = useState("");
  const [newLevel, setNewLevel] = useState<SkillRow["level"]>("intermediate");

  const reload = async () => {
    try {
      const res = await fetch(`/api/admin/users/${userId}/skill-levels`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.skillLevels ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [userId]);

  const setLevel = async (sport: string, level: SkillRow["level"]) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/skill-levels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, level }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Save failed");
        return;
      }
      toast.success("Saved");
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const removeSkill = async (sport: string) => {
    if (!confirm(`Remove ${sport} skill override?`)) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/users/${userId}/skill-levels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sport, remove: true }),
      });
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const addSkill = async () => {
    if (!newSport.trim()) return;
    await setLevel(newSport.trim().toLowerCase(), newLevel);
    setNewSport("");
  };

  if (loading) return <p className="text-ink-muted text-sm">Loading…</p>;
  if (error) return <ErrorBanner message={error} />;

  return (
    <section className="space-y-4">
      <header>
        <h3 className="font-semibold text-ink">Skill levels</h3>
        <p className="text-xs text-ink-muted mt-1">
          Per-sport skill overrides. Admin-assigned levels supersede the
          user's self-reported level for capacity gates and team balancing.
        </p>
      </header>

      {rows.length === 0 && (
        <p className="text-sm text-ink-muted">No skill levels recorded.</p>
      )}

      {rows.length > 0 && (
        <ul className="rounded-lg border border-border bg-cream-2 divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.sport}
              className="px-4 py-3 flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-medium text-ink capitalize">{r.sport}</div>
                <div className="text-xs text-ink-muted">
                  set {new Date(r.setAt).toLocaleDateString()} ·{" "}
                  <Badge variant="outline" className="text-[10px]">
                    {r.source.replace("_", " ")}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={r.level}
                  onChange={(e) =>
                    setLevel(r.sport, e.target.value as SkillRow["level"])
                  }
                  disabled={busy}
                  className="rounded border border-border bg-cream px-2 py-1 text-sm"
                >
                  {LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => removeSkill(r.sport)}
                  disabled={busy}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="rounded-lg border border-border bg-cream p-4 space-y-3">
        <div className="text-sm font-medium text-ink">Add skill</div>
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="sport (e.g. soccer)"
            value={newSport}
            onChange={(e) => setNewSport(e.target.value)}
            className="flex-1 min-w-40"
          />
          <select
            value={newLevel}
            onChange={(e) => setNewLevel(e.target.value as SkillRow["level"])}
            className="rounded border border-border bg-cream px-2 py-1 text-sm"
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <Button onClick={addSkill} disabled={busy || !newSport.trim()}>
            Add
          </Button>
        </div>
      </div>
    </section>
  );
}
