"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import {
  todayWindow,
  formatSessionTime,
  formatTodayLabel,
  facilityLabel,
  skillChip,
} from "@/lib/soccerone/tonight";

interface StripSession {
  id: string;
  kind: "pickup" | "class";
  startsAt: string;
  skillLevel: "recreational" | "intermediate" | "advanced" | "all_levels";
  venueName: string | null;
}

const MAX_SESSIONS = 4;

// NOTE: this island styles itself — Astro scoped styles do not reach React
// islands (known prod incident; see memory/design docs).
const S = {
  strip: {
    background: "#0c0c10",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
  } as React.CSSProperties,
  inner: {
    maxWidth: 1400,
    margin: "0 auto",
    padding: "1rem 2rem",
    display: "flex",
    alignItems: "center",
    gap: "1.5rem",
    flexWrap: "wrap",
  } as React.CSSProperties,
  label: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.5rem",
    fontFamily: "var(--so-font-mono)",
    fontSize: "0.6875rem",
    fontWeight: 600,
    letterSpacing: "0.12em",
    color: "var(--so-lime)",
    flexShrink: 0,
  } as React.CSSProperties,
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--so-lime)",
    boxShadow: "0 0 8px var(--so-lime)",
  } as React.CSSProperties,
  sessions: {
    display: "flex",
    alignItems: "center",
    gap: "1.25rem",
    flexWrap: "wrap",
    flex: 1,
  } as React.CSSProperties,
  item: { display: "inline-flex", alignItems: "baseline", gap: "0.5rem", fontSize: "0.875rem" } as React.CSSProperties,
  time: { fontFamily: "var(--so-font-mono)", fontSize: "0.8125rem", color: "#fff", fontWeight: 600 } as React.CSSProperties,
  place: { color: "rgba(255,255,255,0.55)" } as React.CSSProperties,
  level: {
    fontFamily: "var(--so-font-mono)",
    fontSize: "0.5625rem",
    letterSpacing: "0.08em",
    color: "rgba(163,230,53,0.7)",
    border: "1px solid rgba(163,230,53,0.25)",
    padding: "1px 6px",
    borderRadius: 3,
  } as React.CSSProperties,
  divider: { width: 1, height: 16, background: "rgba(255,255,255,0.12)", alignSelf: "center" } as React.CSSProperties,
  cta: {
    fontSize: "0.8125rem",
    fontWeight: 600,
    color: "var(--so-lime)",
    textDecoration: "none",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } as React.CSSProperties,
};

export default function HomeTonightStrip() {
  useHydrationBeacon();
  const [sessions, setSessions] = useState<StripSession[] | null>(null);

  useEffect(() => {
    const { fromIso, toIso } = todayWindow();
    const qs = new URLSearchParams({ from: fromIso, to: toIso });
    fetch(`/api/dropin/sessions?${qs}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`${res.status}`))))
      .then((body) => {
        const pickup = (body.sessions ?? []).filter(
          (s: StripSession) => s.kind === "pickup",
        );
        setSessions(pickup.slice(0, MAX_SESSIONS));
      })
      .catch(() => setSessions([]));
  }, []);

  // Loading, error, and no-sessions-tonight all collapse to nothing — the
  // strip is a bonus, never a broken band.
  if (!sessions || sessions.length === 0) return null;

  return (
    <div style={S.strip} data-testid="tonight-strip">
      <div style={S.inner}>
        <span style={S.label}>
          <span style={S.dot} />
          PICKUP TONIGHT · {formatTodayLabel()}
        </span>
        <div style={S.sessions}>
          {sessions.map((s, i) => (
            <span key={s.id} style={{ display: "contents" }}>
              {i > 0 && <span style={S.divider} />}
              <span style={S.item}>
                <span style={S.time}>{formatSessionTime(s.startsAt)}</span>
                <span style={S.place}>{facilityLabel(s.venueName)}</span>
                <span style={S.level}>{skillChip(s.skillLevel)}</span>
              </span>
            </span>
          ))}
        </div>
        <a href="/pickup" style={S.cta}>
          All sessions &amp; drop-in rates →
        </a>
      </div>
    </div>
  );
}
