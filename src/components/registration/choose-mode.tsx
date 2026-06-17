"use client";
import { priceLabel } from "@/lib/leagues/rail-content";

export default function ChooseMode({
  season,
  canTeam,
  onPick,
}: {
  season: { price: number; teamPrice: number | null; deposit: number | null };
  canTeam: boolean;
  onPick: (m: "solo" | "team") => void;
}) {
  const solo = priceLabel("solo", season);
  const team = priceLabel("team", season);
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
        Step 1 of 4
      </p>
      <h1 className="font-display text-2xl text-ink mt-1 mb-4">How do you want to join?</h1>
      <button
        onClick={() => onPick("solo")}
        className="block w-full text-left rounded-xl border border-ink/15 hover:border-primary p-4 mb-3"
      >
        <div className="font-display text-lg">Join solo →</div>
        <div className="text-sm text-ink-muted">
          We place you on a team. <b>{solo.amount}</b>
        </div>
      </button>
      {canTeam && (
        <button
          onClick={() => onPick("team")}
          className="block w-full text-left rounded-xl border border-ink/15 hover:border-primary p-4"
        >
          <div className="font-display text-lg">Bring a team →</div>
          <div className="text-sm text-ink-muted">
            You captain a full roster. <b>{team.amount}</b>
          </div>
        </button>
      )}
    </div>
  );
}
