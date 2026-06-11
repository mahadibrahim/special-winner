"use client";

import React, { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

// Shape returned by GET /api/dropin/sessions.
// venueName is a flat field (left-joined from venues); confirmedCount is
// computed inline so the UI can render the capacity bar without a follow-up.
interface DropInSession {
  id: string;
  kind: "pickup" | "class";
  sportOrClassLabel: string;
  formatLabel: string | null;
  startsAt: string; // ISO datetime
  endsAt: string;   // ISO datetime
  capacity: number;
  skillLevel: "recreational" | "intermediate" | "advanced" | "all_levels";
  audience: "adults" | "youth" | "all_ages";
  membersOnly: boolean;
  sessionRateCents: number;
  memberRateCents: number | null;
  venueId: string | null;
  venueName: string | null;
  confirmedCount: number;
}

interface SessionsResponse {
  sessions: DropInSession[];
  defaults: {
    defaultSessionRateCents: number;
    defaultMemberRateCents: number;
  } | null;
}

type DisplaySkill = "Recreational" | "Intermediate" | "Advanced" | "All Levels";

function mapSkillLevel(level: DropInSession["skillLevel"]): DisplaySkill {
  switch (level) {
    case "recreational": return "Recreational";
    case "intermediate": return "Intermediate";
    case "advanced":     return "Advanced";
    case "all_levels":   return "All Levels";
  }
}

function skillColor(level: DropInSession["skillLevel"]) {
  switch (level) {
    case "recreational": return { bg: "rgba(74,222,128,0.12)",  border: "rgba(74,222,128,0.4)",  text: "#86efac" };
    case "intermediate": return { bg: "rgba(250,204,21,0.1)",   border: "rgba(250,204,21,0.35)", text: "#fde047" };
    case "advanced":     return { bg: "rgba(251,113,133,0.1)",  border: "rgba(251,113,133,0.4)", text: "#fda4af" };
    case "all_levels":   return { bg: "rgba(139,92,246,0.1)",   border: "rgba(139,92,246,0.4)",  text: "#c4b5fd" };
  }
}

function spotsUrgency(spotsLeft: number, total: number) {
  const pct = spotsLeft / total;
  if (spotsLeft <= 2) return { color: "#f97316", label: `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left!` };
  if (pct <= 0.35)   return { color: "#facc15", label: `${spotsLeft} spots left` };
  return { color: "rgba(255,255,255,0.45)", label: `${spotsLeft} spots left` };
}

function isStartingToday(iso: string): boolean {
  const d = new Date(iso);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatDate(iso: string, today: boolean): string {
  if (today) return "Today";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function GameCard({ session }: { session: DropInSession }) {
  const skillC = skillColor(session.skillLevel);
  const spotsLeft = Math.max(0, session.capacity - session.confirmedCount);
  const spots = spotsUrgency(spotsLeft, session.capacity);
  const today = isStartingToday(session.startsAt);
  const displayDate = formatDate(session.startsAt, today);
  const displayTime = formatTime(session.startsAt);
  const displaySkill = mapSkillLevel(session.skillLevel);
  const priceDollars = session.sessionRateCents / 100;

  return (
    <div className="pickup-game-card" style={{ borderColor: skillC.border, background: skillC.bg }}>
      <div className="pgc-header">
        <span className="pgc-skill-badge" style={{ color: skillC.text, background: `${skillC.text}20` }}>
          {displaySkill}
        </span>
        {spotsLeft <= 2 && (
          <span className="pgc-urgent-badge">Almost full</span>
        )}
      </div>

      <div className="pgc-name">{session.sportOrClassLabel}</div>

      <div className="pgc-meta">
        <div className="pgc-meta-item">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6.25" stroke="rgba(255,255,255,0.4)" strokeWidth="1.25"/>
            <polyline points="7,3.5 7,7 9.5,8.75" stroke="rgba(255,255,255,0.5)" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          <span>{displayDate} · {displayTime}</span>
        </div>
        {session.venueName && (
          <div className="pgc-meta-item">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.25"/>
              <line x1="1" y1="5.5" x2="13" y2="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="0.875"/>
              <line x1="7" y1="2.5" x2="7" y2="11.5" stroke="rgba(255,255,255,0.2)" strokeWidth="0.875"/>
            </svg>
            <span>{session.venueName}</span>
          </div>
        )}
      </div>

      <div className="pgc-footer">
        <div className="pgc-spots">
          <div className="pgc-spots-bar">
            <div
              className="pgc-spots-fill"
              style={{ width: `${((session.capacity - spotsLeft) / session.capacity) * 100}%` }}
            ></div>
          </div>
          <span className="pgc-spots-label" style={{ color: spots.color }}>{spots.label}</span>
        </div>

        <div className="pgc-price-row">
          <span className="pgc-price">${priceDollars}</span>
          <a href={`/dropin/${session.id}`} className="pgc-book-btn">
            Book Now
          </a>
        </div>
      </div>

      <style>{`
        .pickup-game-card {
          border-width: 1.5px;
          border-style: solid;
          border-radius: var(--so-radius-xl);
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          min-width: 260px;
          max-width: 340px;
          transition: transform 0.2s;
          font-family: var(--so-font-body);
        }
        .pickup-game-card:hover {
          transform: translateY(-2px);
        }
        .pgc-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .pgc-skill-badge {
          font-family: var(--so-font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: var(--so-radius-pill);
        }
        .pgc-urgent-badge {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #f97316;
          background: rgba(249,115,22,0.15);
          padding: 3px 8px;
          border-radius: var(--so-radius-pill);
          text-transform: uppercase;
        }
        .pgc-name {
          font-family: var(--so-font-body);
          font-size: 1rem;
          font-weight: 700;
          color: #ffffff;
          line-height: 1.25;
        }
        .pgc-meta {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .pgc-meta-item {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.55);
        }
        .pgc-footer {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .pgc-spots {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .pgc-spots-bar {
          height: 4px;
          background: rgba(255,255,255,0.1);
          border-radius: var(--so-radius-xs);
          overflow: hidden;
        }
        .pgc-spots-fill {
          height: 100%;
          background: rgba(255,255,255,0.35);
          border-radius: var(--so-radius-xs);
          transition: width 0.3s;
        }
        .pgc-spots-label {
          font-size: 0.8125rem;
          font-weight: 600;
        }
        .pgc-price-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .pgc-price {
          font-family: var(--so-font-body);
          font-size: 1.375rem;
          font-weight: 800;
          color: #facc15;
          letter-spacing: -0.03em;
        }
        .pgc-book-btn {
          background: #facc15;
          color: var(--so-navy);
          font-family: var(--so-font-body);
          font-size: 0.8125rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border: none;
          border-radius: var(--so-radius-md);
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: filter 0.15s, transform 0.1s;
          text-decoration: none;
          display: inline-block;
        }
        .pgc-book-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}

export default function PickupGames() {
  const [sessions, setSessions] = useState<DropInSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/dropin/sessions")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as SessionsResponse;
        if (!cancelled) setSessions(body.sessions ?? []);
      })
      .catch((e: unknown) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load sessions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const todaySessions = sessions.filter((s) => isStartingToday(s.startsAt));
  const upcomingSessions = sessions.filter((s) => !isStartingToday(s.startsAt));

  if (loading) {
    return <LoadingSkeleton />;
  }
  if (error) {
    return <ErrorBanner message={`Couldn't load pickup games: ${error}`} />;
  }
  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No pickup games scheduled"
        description="Check back soon — new sessions go up weekly."
      />
    );
  }

  return (
    <div className="pickup-games-root">
      {/* Today's games */}
      {todaySessions.length > 0 && (
        <div className="games-section-wrap">
          <div className="games-section-inner">
            <div className="games-section-header">
              <div className="games-section-title-row">
                <span className="games-live-dot" aria-hidden="true"></span>
                <h2 className="games-section-title">Today's Pickup Games</h2>
              </div>
              <p className="games-section-desc">
                Show up 15 min early to check in.
              </p>
            </div>

            <div className="games-today-grid">
              {todaySessions.map((s) => (
                <GameCard key={s.id} session={s} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Upcoming sessions scroll row */}
      {upcomingSessions.length > 0 && (
        <div className="games-week-wrap">
          <div className="games-section-inner">
            <div className="games-section-header">
              <h2 className="games-section-title">Upcoming Pickup Games</h2>
              <p className="games-section-desc">Scroll to see the full schedule. Book up to 7 days in advance.</p>
            </div>

            <div className="games-week-scroll">
              {upcomingSessions.map((s) => (
                <GameCard key={s.id} session={s} />
              ))}
            </div>
          </div>
        </div>
      )}

      <style>{`
        .pickup-games-root {
          font-family: var(--so-font-body);
        }
        .games-section-wrap {
          padding: 3.5rem 0 2rem;
          background: var(--so-navy);
        }
        .games-section-inner {
          max-width: 1280px;
          margin: 0 auto;
          padding: 0 1.5rem;
        }
        .games-section-header {
          margin-bottom: 1.75rem;
        }
        .games-section-title-row {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          margin-bottom: 0.375rem;
        }
        .games-live-dot {
          display: inline-block;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #4ade80;
          flex-shrink: 0;
          animation: live-pulse 1.5s ease-in-out infinite;
        }
        @keyframes live-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(74,222,128,0.5); }
          50% { opacity: 0.7; box-shadow: 0 0 0 6px rgba(74,222,128,0); }
        }
        .games-section-title {
          font-family: var(--so-font-body);
          font-size: 1.5rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.02em;
          margin: 0;
        }
        .games-section-desc {
          font-size: 0.9375rem;
          color: rgba(255,255,255,0.45);
          margin: 0;
        }
        .games-today-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 1.25rem;
        }
        .games-week-wrap {
          padding: 2rem 0 4rem;
          background: var(--so-navy-raised);
          border-top: 1px solid rgba(255,255,255,0.06);
        }
        .games-week-scroll {
          display: flex;
          gap: 1rem;
          overflow-x: auto;
          padding-bottom: 1rem;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
        }
        .games-week-scroll > * {
          scroll-snap-align: start;
          flex-shrink: 0;
          width: 285px;
        }
      `}</style>
    </div>
  );
}
