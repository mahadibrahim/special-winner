"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PickupGame {
  id: string;
  name: string;
  skillLevel: "Beginner" | "Intermediate" | "Competitive";
  time: string;
  date: string;
  field: string;
  totalSpots: number;
  spotsLeft: number;
  price: number;
  isToday: boolean;
}

const TODAY_GAMES: PickupGame[] = [
  {
    id: "t1",
    name: "Evening Coed Pickup",
    skillLevel: "Intermediate",
    time: "6:00 PM",
    date: "Today, Apr 27",
    field: "Field 3",
    totalSpots: 12,
    spotsLeft: 3,
    price: 12,
    isToday: true,
  },
  {
    id: "t2",
    name: "Late Night Competitive",
    skillLevel: "Competitive",
    time: "9:00 PM",
    date: "Today, Apr 27",
    field: "Field 1",
    totalSpots: 10,
    spotsLeft: 7,
    price: 12,
    isToday: true,
  },
  {
    id: "t3",
    name: "Beginner Friendly",
    skillLevel: "Beginner",
    time: "7:30 PM",
    date: "Today, Apr 27",
    field: "Field 5",
    totalSpots: 14,
    spotsLeft: 10,
    price: 12,
    isToday: true,
  },
];

const WEEK_GAMES: PickupGame[] = [
  {
    id: "w1",
    name: "Morning Pickup",
    skillLevel: "Intermediate",
    time: "7:00 AM",
    date: "Tue, Apr 28",
    field: "Field 2",
    totalSpots: 12,
    spotsLeft: 9,
    price: 12,
    isToday: false,
  },
  {
    id: "w2",
    name: "Lunch Pickup",
    skillLevel: "Beginner",
    time: "12:00 PM",
    date: "Tue, Apr 28",
    field: "Field 4",
    totalSpots: 12,
    spotsLeft: 11,
    price: 12,
    isToday: false,
  },
  {
    id: "w3",
    name: "Competitive Midweek",
    skillLevel: "Competitive",
    time: "7:00 PM",
    date: "Wed, Apr 29",
    field: "Field 1",
    totalSpots: 10,
    spotsLeft: 2,
    price: 12,
    isToday: false,
  },
  {
    id: "w4",
    name: "Beginner Night",
    skillLevel: "Beginner",
    time: "6:30 PM",
    date: "Wed, Apr 29",
    field: "Field 7",
    totalSpots: 14,
    spotsLeft: 8,
    price: 12,
    isToday: false,
  },
  {
    id: "w5",
    name: "Thursday Intermediate",
    skillLevel: "Intermediate",
    time: "7:30 PM",
    date: "Thu, Apr 30",
    field: "Field 3",
    totalSpots: 12,
    spotsLeft: 5,
    price: 12,
    isToday: false,
  },
  {
    id: "w6",
    name: "Friday Night Pickup",
    skillLevel: "Intermediate",
    time: "8:00 PM",
    date: "Fri, May 1",
    field: "Field 2",
    totalSpots: 12,
    spotsLeft: 1,
    price: 12,
    isToday: false,
  },
  {
    id: "w7",
    name: "Saturday Morning All-Levels",
    skillLevel: "Beginner",
    time: "9:00 AM",
    date: "Sat, May 2",
    field: "Field 6",
    totalSpots: 16,
    spotsLeft: 12,
    price: 12,
    isToday: false,
  },
  {
    id: "w8",
    name: "Saturday Competitive",
    skillLevel: "Competitive",
    time: "6:00 PM",
    date: "Sat, May 2",
    field: "Field 1",
    totalSpots: 10,
    spotsLeft: 6,
    price: 12,
    isToday: false,
  },
  {
    id: "w9",
    name: "Sunday Morning Pickup",
    skillLevel: "Intermediate",
    time: "8:00 AM",
    date: "Sun, May 3",
    field: "Field 4",
    totalSpots: 12,
    spotsLeft: 10,
    price: 12,
    isToday: false,
  },
];

interface ReserveModal {
  game: PickupGame;
}

function skillColor(level: PickupGame["skillLevel"]) {
  switch (level) {
    case "Beginner":     return { bg: "rgba(74,222,128,0.12)", border: "rgba(74,222,128,0.4)", text: "#86efac" };
    case "Intermediate": return { bg: "rgba(250,204,21,0.1)",  border: "rgba(250,204,21,0.35)", text: "#fde047" };
    case "Competitive":  return { bg: "rgba(251,113,133,0.1)", border: "rgba(251,113,133,0.4)", text: "#fda4af" };
  }
}

function spotsUrgency(spotsLeft: number, total: number) {
  const pct = spotsLeft / total;
  if (spotsLeft <= 2) return { color: "#f97316", label: `${spotsLeft} spot${spotsLeft === 1 ? "" : "s"} left!` };
  if (pct <= 0.35)   return { color: "#facc15", label: `${spotsLeft} spots left` };
  return { color: "rgba(255,255,255,0.45)", label: `${spotsLeft} spots left` };
}

function GameCard({ game, onReserve }: { game: PickupGame; onReserve: (g: PickupGame) => void }) {
  const skillC = skillColor(game.skillLevel);
  const spots = spotsUrgency(game.spotsLeft, game.totalSpots);

  return (
    <div className="pickup-game-card" style={{ borderColor: skillC.border, background: skillC.bg }}>
      <div className="pgc-header">
        <span className="pgc-skill-badge" style={{ color: skillC.text, background: `${skillC.text}20` }}>
          {game.skillLevel}
        </span>
        {game.spotsLeft <= 2 && (
          <span className="pgc-urgent-badge">Almost full</span>
        )}
      </div>

      <div className="pgc-name">{game.name}</div>

      <div className="pgc-meta">
        <div className="pgc-meta-item">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="6.25" stroke="rgba(255,255,255,0.4)" strokeWidth="1.25"/>
            <polyline points="7,3.5 7,7 9.5,8.75" stroke="rgba(255,255,255,0.5)" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          <span>{game.date} · {game.time}</span>
        </div>
        <div className="pgc-meta-item">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
            <rect x="1" y="2.5" width="12" height="9" rx="1.5" stroke="rgba(255,255,255,0.4)" strokeWidth="1.25"/>
            <line x1="1" y1="5.5" x2="13" y2="5.5" stroke="rgba(255,255,255,0.3)" strokeWidth="0.875"/>
            <line x1="7" y1="2.5" x2="7" y2="11.5" stroke="rgba(255,255,255,0.2)" strokeWidth="0.875"/>
          </svg>
          <span>{game.field}</span>
        </div>
      </div>

      <div className="pgc-footer">
        <div className="pgc-spots">
          <div className="pgc-spots-bar">
            <div
              className="pgc-spots-fill"
              style={{ width: `${((game.totalSpots - game.spotsLeft) / game.totalSpots) * 100}%` }}
            ></div>
          </div>
          <span className="pgc-spots-label" style={{ color: spots.color }}>{spots.label}</span>
        </div>

        <div className="pgc-price-row">
          <span className="pgc-price">${game.price}</span>
          <button className="pgc-reserve-btn" onClick={() => onReserve(game)}>
            Reserve a spot
          </button>
        </div>
      </div>

      <style>{`
        .pickup-game-card {
          border-width: 1.5px;
          border-style: solid;
          border-radius: 12px;
          padding: 1.25rem;
          display: flex;
          flex-direction: column;
          gap: 0.875rem;
          min-width: 260px;
          max-width: 340px;
          transition: transform 0.2s;
          font-family: 'Inter', sans-serif;
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
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 20px;
        }
        .pgc-urgent-badge {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #f97316;
          background: rgba(249,115,22,0.15);
          padding: 3px 8px;
          border-radius: 20px;
          text-transform: uppercase;
        }
        .pgc-name {
          font-family: 'Space Grotesk', sans-serif;
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
          border-radius: 2px;
          overflow: hidden;
        }
        .pgc-spots-fill {
          height: 100%;
          background: rgba(255,255,255,0.35);
          border-radius: 2px;
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
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.375rem;
          font-weight: 800;
          color: #facc15;
          letter-spacing: -0.03em;
        }
        .pgc-reserve-btn {
          background: #facc15;
          color: #0a1929;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 0.8125rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border: none;
          border-radius: 6px;
          padding: 0.5rem 1rem;
          cursor: pointer;
          transition: filter 0.15s, transform 0.1s;
        }
        .pgc-reserve-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  );
}

interface ModalState {
  game: PickupGame;
  name: string;
  email: string;
  submitting: boolean;
}

export default function PickupGames() {
  const [modal, setModal] = useState<ModalState | null>(null);

  const handleReserve = (game: PickupGame) => {
    setModal({ game, name: "", email: "", submitting: false });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setModal((prev) => prev ? { ...prev, submitting: true } : null);
    setTimeout(() => {
      toast("Demo only — pickup reservations launching Q2 2026", {
        description: "You can show up at the door and pay $12. We'll have spots.",
        duration: 6000,
      });
      setModal(null);
    }, 600);
  };

  return (
    <div className="pickup-games-root">
      {/* Today's games */}
      <div className="games-section-wrap">
        <div className="games-section-inner">
          <div className="games-section-header">
            <div className="games-section-title-row">
              <span className="games-live-dot" aria-hidden="true"></span>
              <h2 className="games-section-title">Today's Pickup Games</h2>
            </div>
            <p className="games-section-desc">
              Mon Apr 27 — spots update in real time. Show up 15 min early to check in.
            </p>
          </div>

          <div className="games-today-grid">
            {TODAY_GAMES.map((g) => (
              <GameCard key={g.id} game={g} onReserve={handleReserve} />
            ))}
          </div>
        </div>
      </div>

      {/* This week's scroll row */}
      <div className="games-week-wrap">
        <div className="games-section-inner">
          <div className="games-section-header">
            <h2 className="games-section-title">This Week's Pickup Games</h2>
            <p className="games-section-desc">Scroll to see the full week. Reserve up to 7 days in advance.</p>
          </div>

          <div className="games-week-scroll">
            {WEEK_GAMES.map((g) => (
              <GameCard key={g.id} game={g} onReserve={handleReserve} />
            ))}
          </div>
        </div>
      </div>

      {/* Reserve modal */}
      {modal && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) setModal(null); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div className="modal-panel">
            <div className="modal-header">
              <h2 id="modal-title" className="modal-title">Reserve a Spot</h2>
              <button
                className="modal-close"
                onClick={() => setModal(null)}
                aria-label="Close"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
                </svg>
              </button>
            </div>

            <div className="modal-game-info">
              <strong>{modal.game.name}</strong>
              <span>{modal.game.date} · {modal.game.time} · {modal.game.field}</span>
              <span className="modal-skill-tag">{modal.game.skillLevel}</span>
            </div>

            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-field">
                <label htmlFor="pickup-name" className="modal-label">Your name</label>
                <input
                  id="pickup-name"
                  type="text"
                  className="modal-input"
                  placeholder="Alex Garcia"
                  required
                  value={modal.name}
                  onChange={(e) => setModal((prev) => prev ? { ...prev, name: e.target.value } : null)}
                />
              </div>

              <div className="modal-field">
                <label htmlFor="pickup-email" className="modal-label">Email address</label>
                <input
                  id="pickup-email"
                  type="email"
                  className="modal-input"
                  placeholder="alex@example.com"
                  required
                  value={modal.email}
                  onChange={(e) => setModal((prev) => prev ? { ...prev, email: e.target.value } : null)}
                />
                <p className="modal-input-hint">We'll text you field assignment 30 min before game time.</p>
              </div>

              <div className="modal-price-note">
                <span className="price-note-label">Door price</span>
                <span className="price-note-amount">${modal.game.price}</span>
                <span className="price-note-detail">· Founders pay $0</span>
              </div>

              <button
                type="submit"
                className="modal-submit-btn"
                disabled={modal.submitting}
              >
                {modal.submitting ? "Reserving…" : "Confirm reservation"}
              </button>
            </form>
          </div>
        </div>
      )}

      <style>{`
        .pickup-games-root {
          font-family: 'Inter', sans-serif;
        }
        .games-section-wrap {
          padding: 3.5rem 0 2rem;
          background: #0a1929;
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
          font-family: 'Space Grotesk', sans-serif;
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
          background: #0d2035;
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
        /* Modal */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(5,12,22,0.85);
          backdrop-filter: blur(6px);
          z-index: 200;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 1.5rem;
        }
        .modal-panel {
          background: #0d2035;
          border: 1.5px solid rgba(250,204,21,0.4);
          border-radius: 16px;
          padding: 2rem;
          width: 100%;
          max-width: 440px;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .modal-title {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.25rem;
          font-weight: 700;
          color: #ffffff;
          margin: 0;
        }
        .modal-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          padding: 4px;
          border-radius: 4px;
          transition: color 0.15s;
        }
        .modal-close:hover { color: white; }
        .modal-game-info {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding: 1rem;
          background: rgba(255,255,255,0.05);
          border-radius: 8px;
        }
        .modal-game-info strong {
          font-size: 1rem;
          font-weight: 700;
          color: white;
        }
        .modal-game-info span {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.5);
        }
        .modal-skill-tag {
          font-size: 0.75rem !important;
          font-weight: 700;
          color: #facc15 !important;
          background: rgba(250,204,21,0.12);
          padding: 2px 8px;
          border-radius: 20px;
          display: inline-block;
          width: fit-content;
          font-family: 'Space Grotesk', sans-serif;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .modal-form {
          display: flex;
          flex-direction: column;
          gap: 1.125rem;
        }
        .modal-field {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .modal-label {
          font-size: 0.8125rem;
          font-weight: 600;
          color: rgba(255,255,255,0.6);
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }
        .modal-input {
          background: rgba(255,255,255,0.05);
          border: 1.5px solid rgba(255,255,255,0.15);
          border-radius: 8px;
          color: white;
          font-size: 1rem;
          padding: 0.75rem 1rem;
          outline: none;
          transition: border-color 0.15s;
          font-family: 'Inter', sans-serif;
        }
        .modal-input::placeholder { color: rgba(255,255,255,0.25); }
        .modal-input:focus { border-color: #facc15; }
        .modal-input-hint {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.3);
          margin: 0;
          line-height: 1.4;
        }
        .modal-price-note {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1rem;
          background: rgba(250,204,21,0.08);
          border: 1px solid rgba(250,204,21,0.2);
          border-radius: 8px;
        }
        .price-note-label {
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .price-note-amount {
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.25rem;
          font-weight: 800;
          color: #facc15;
          letter-spacing: -0.03em;
        }
        .price-note-detail {
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.35);
        }
        .modal-submit-btn {
          background: #facc15;
          color: #0a1929;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          border: none;
          border-radius: 8px;
          padding: 1rem;
          cursor: pointer;
          transition: filter 0.15s;
        }
        .modal-submit-btn:hover:not(:disabled) { filter: brightness(1.08); }
        .modal-submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
