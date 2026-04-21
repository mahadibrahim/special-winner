"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  TaggerRosterSidebar,
  type RosterEntry,
} from "./tagger-roster-sidebar";
import {
  TaggerAssetViewer,
  type TaggerAsset,
} from "./tagger-asset-viewer";
import { TaggerPerformanceBar } from "./tagger-performance-bar";
import { TaggerBurstHint } from "./tagger-burst-hint";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

type Payload = {
  session: { id: string; status: string; game_id: string | null };
  assets: TaggerAsset[];
  roster: {
    home: {
      team_id: string | null;
      team_name: string | null;
      players: RosterEntry[];
    };
    away: {
      team_id: string | null;
      team_name: string | null;
      players: RosterEntry[];
    };
  };
};

type Props = { sessionId: string; initialPayload: Payload };

type UndoEntry = { tagIds: string[] };

export function TaggerApp({ sessionId, initialPayload }: Props) {
  useHydrationBeacon();
  const [payload, setPayload] = useState<Payload>(initialPayload);
  const [idx, setIdx] = useState(0);
  const [side, setSide] = useState<"home" | "away">("home");
  const [jerseyBuffer, setJerseyBuffer] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [tagsCreatedCount, setTagsCreatedCount] = useState(0);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const sessionStartRef = useRef<number>(Date.now());
  const searchRef = useRef<HTMLInputElement | null>(null);

  const asset = payload.assets[idx] ?? null;

  const burstAssets = useMemo(
    () =>
      asset?.burst_group_id
        ? payload.assets.filter(
            (a) => a.burst_group_id === asset.burst_group_id
          )
        : asset
          ? [asset]
          : [],
    [asset, payload.assets]
  );
  const positionInBurst = asset
    ? burstAssets.findIndex((a) => a.id === asset.id) + 1
    : 0;

  const tagCountsByPlayer = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of payload.assets) {
      for (const t of a.tags) {
        if (t.family_member_id) {
          counts[t.family_member_id] = (counts[t.family_member_id] ?? 0) + 1;
        }
      }
    }
    return counts;
  }, [payload.assets]);

  const taggedOnCurrent = useMemo(() => {
    const s = new Set<string>();
    if (asset) {
      for (const t of asset.tags)
        if (t.family_member_id) s.add(t.family_member_id);
    }
    return s;
  }, [asset]);

  const taggedAssets = useMemo(
    () => payload.assets.filter((a) => a.tags.length > 0).length,
    [payload.assets]
  );

  const activeRoster =
    side === "home" ? payload.roster.home : payload.roster.away;

  const goPrev = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);
  const goNext = useCallback(
    () => setIdx((i) => Math.min(payload.assets.length - 1, i + 1)),
    [payload.assets.length]
  );

  const reload = useCallback(async () => {
    const res = await fetch(`/api/media/tag/${sessionId}`, {
      credentials: "same-origin",
    });
    if (res.ok) setPayload(await res.json());
  }, [sessionId]);

  const postTags = useCallback(
    async (
      tags: Array<{
        asset_id: string;
        tag_scope: "player" | "team" | "both_teams";
        family_member_id?: string | null;
        team_id?: string | null;
        source: string;
      }>,
      propagate = false
    ) => {
      if (tags.length === 0) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/media/tag/${sessionId}/tags`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tags, propagate_to_burst: propagate }),
          credentials: "same-origin",
        });
        if (!res.ok) {
          console.error("tag failed", await res.text());
          return;
        }
        const json = await res.json();
        const newIds = (json.created ?? []).map((t: any) => t.id);
        setTagsCreatedCount((n) => n + newIds.length);
        if (newIds.length > 0) {
          setUndoStack((stack) => [...stack, { tagIds: newIds }]);
        }
        await reload();
      } finally {
        setBusy(false);
      }
    },
    [sessionId, reload]
  );

  const deleteTag = useCallback(
    async (tagId: string) => {
      await fetch(`/api/media/tag/${sessionId}/tags/${tagId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
    },
    [sessionId]
  );

  const applyJerseyBuffer = useCallback(
    async (opts: { propagate: boolean }) => {
      if (!asset) return;
      const jerseys = jerseyBuffer
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      if (jerseys.length === 0) return;

      const matches: RosterEntry[] = [];
      for (const j of jerseys) {
        const found = activeRoster.players.find((p) => p.jersey_number === j);
        if (found) matches.push(found);
      }
      if (matches.length === 0) {
        setJerseyBuffer("");
        return;
      }
      await postTags(
        matches.map((m) => ({
          asset_id: asset.id,
          tag_scope: "player" as const,
          family_member_id: m.id,
          source: "manual_admin",
        })),
        opts.propagate
      );
      setJerseyBuffer("");
      if (!opts.propagate) goNext();
    },
    [asset, jerseyBuffer, activeRoster.players, postTags, goNext]
  );

  const togglePlayerOnCurrent = useCallback(
    async (familyMemberId: string) => {
      if (!asset) return;
      const existing = asset.tags.find(
        (t) => t.family_member_id === familyMemberId
      );
      if (existing) {
        await deleteTag(existing.id);
        await reload();
        return;
      }
      await postTags([
        {
          asset_id: asset.id,
          tag_scope: "player",
          family_member_id: familyMemberId,
          source: "manual_admin",
        },
      ]);
    },
    [asset, deleteTag, reload, postTags]
  );

  const skipAsset = useCallback(async () => {
    goNext();
  }, [goNext]);

  const undoLast = useCallback(async () => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    for (const id of last.tagIds) await deleteTag(id);
    setUndoStack((stack) => stack.slice(0, -1));
    setTagsCreatedCount((n) => Math.max(0, n - last.tagIds.length));
    await reload();
  }, [undoStack, deleteTag, reload]);

  const tagWholeTeam = useCallback(
    async (teamSide: "home" | "away" | "both") => {
      if (!asset) return;
      if (teamSide === "both") {
        await postTags([
          {
            asset_id: asset.id,
            tag_scope: "both_teams",
            source: "manual_admin",
          },
        ]);
        return;
      }
      const team =
        teamSide === "home" ? payload.roster.home : payload.roster.away;
      if (!team.team_id) return;
      await postTags([
        {
          asset_id: asset.id,
          tag_scope: "team",
          team_id: team.team_id,
          source: "manual_admin",
        },
      ]);
    },
    [asset, postTags, payload.roster.home, payload.roster.away]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const inSearch =
        document.activeElement === searchRef.current ||
        (document.activeElement instanceof HTMLInputElement &&
          document.activeElement.type === "search");

      if (e.key === ".") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (inSearch) return;

      if (e.shiftKey && e.key === "Enter") {
        e.preventDefault();
        void applyJerseyBuffer({ propagate: true });
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        void applyJerseyBuffer({ propagate: false });
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        setJerseyBuffer((s) => s + e.key);
        return;
      }
      if (e.key === ",") {
        e.preventDefault();
        setJerseyBuffer((s) => (s.endsWith(",") ? s : s + ","));
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        setJerseyBuffer((s) => s.slice(0, -1));
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void skipAsset();
        return;
      }
      if (k === "u") {
        e.preventDefault();
        void undoLast();
        return;
      }
      if (k === "t") {
        e.preventDefault();
        void tagWholeTeam("both");
        return;
      }
      if (k === "h") {
        e.preventDefault();
        void tagWholeTeam("home");
        return;
      }
      if (k === "a") {
        e.preventDefault();
        void tagWholeTeam("away");
        return;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [applyJerseyBuffer, goPrev, goNext, skipAsset, undoLast, tagWholeTeam]);

  async function completeSession() {
    const res = await fetch(`/api/media/tag/${sessionId}/complete`, {
      method: "POST",
      credentials: "same-origin",
    });
    if (res.ok) {
      window.location.href = "/admin/media/tag-queue";
    }
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-2">
        <h1 className="text-sm font-semibold">
          Tagging session {payload.session.id.slice(0, 8)}
        </h1>
        <div className="flex items-center gap-2 text-sm">
          <span
            className="rounded bg-neutral-900 px-2 py-1 font-mono text-white"
            aria-label="Jersey buffer"
            data-testid="jersey-buffer"
          >
            {jerseyBuffer || "—"}
          </span>
          <button
            type="button"
            onClick={completeSession}
            disabled={busy}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            data-testid="complete-session"
          >
            Complete session
          </button>
        </div>
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-[60%] flex-col">
          <TaggerAssetViewer
            asset={asset}
            index={idx}
            total={payload.assets.length}
            onPrev={goPrev}
            onNext={goNext}
          />
          <div className="px-4 py-2">
            {asset && (
              <TaggerBurstHint
                burstSize={burstAssets.length}
                positionInBurst={positionInBurst}
              />
            )}
          </div>
        </div>
        <div className="w-[40%]">
          <TaggerRosterSidebar
            home={payload.roster.home}
            away={payload.roster.away}
            activeSide={side}
            onSideChange={setSide}
            tagCountsByPlayer={tagCountsByPlayer}
            taggedOnCurrent={taggedOnCurrent}
            onTogglePlayer={togglePlayerOnCurrent}
            searchInputRef={searchRef}
          />
        </div>
      </div>
      <TaggerPerformanceBar
        tagsCreatedCount={tagsCreatedCount}
        sessionStartedAt={sessionStartRef.current}
        totalAssets={payload.assets.length}
        taggedAssets={taggedAssets}
      />
    </div>
  );
}
