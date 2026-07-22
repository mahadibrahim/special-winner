"use client";
import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import LeagueContextRail, { type RailSeason } from "./league-context-rail";
import ChooseMode from "./choose-mode";
import TeamCreate from "./team-create";
import RegistrationWizard from "./registration-wizard";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";

type AuthedUser = React.ComponentProps<typeof RegistrationWizard>["user"];

export default function RegisterExperience({
  seasonId,
  user,
  audienceHint,
  wasCancelled,
  teamToken,
  initialMode = null,
}: {
  seasonId: string;
  user: AuthedUser;
  audienceHint: string | null;
  wasCancelled: boolean;
  teamToken: string | null;
  /** ?mode=individual from division cards' Register CTA — the visitor already chose solo, so skip ChooseMode. */
  initialMode?: "individual" | null;
}) {
  useHydrationBeacon();
  const [season, setSeason] = useState<
    | (RailSeason & {
        signupModes: string | null;
        status: string;
        registrationClosed?: boolean;
      })
    | null
  >(null);
  const [err, setErr] = useState<string | null>(null);
  // ?mode=individual comes from division cards' "Register" CTA — the visitor
  // already chose solo, so don't ask again via the ChooseMode screen.
  const [mode, setMode] = useState<"choose" | "solo" | "team">(
    teamToken ? "solo" : initialMode === "individual" ? "solo" : "choose",
  );

  useEffect(() => {
    fetch(`/api/public/seasons/${seasonId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not_found");
        const body = await r.json();
        setSeason(body.season); // detail endpoint wraps in { season }
      })
      .catch(() => setErr("We couldn't load this league. It may be closed."));
  }, [seasonId]);

  // Validate the ?mode=individual hint once server truth arrives: a
  // hand-edited URL on a season without individual signup falls back to the
  // chooser instead of rendering a wizard the season can't accept. Explicit
  // chooser picks are never overridden (this only fires on the URL hint).
  useEffect(() => {
    if (!season) return;
    if (
      mode === "solo" &&
      !teamToken &&
      initialMode === "individual" &&
      season.signupModes &&
      !season.signupModes.includes("individual")
    ) {
      setMode("choose");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  if (err) return <ErrorBanner message={err} />;
  // min-h reserves roughly the wizard's height so the loading→content swap
  // doesn't shift the whole page (register page measured CLS 0.34 — the
  // spinner/skeleton collapse was the biggest single shift).
  if (!season)
    return (
      <div className="min-h-[70vh]">
        <LoadingSkeleton />
      </div>
    );
  if (season.status !== "open")
    return <ErrorBanner message="Registration for this division isn't open." />;
  if (season.registrationClosed)
    return <ErrorBanner message="Registration for this season has closed. Contact us if you'd like to join a roster mid-season." />;

  const canTeam = !!season.signupModes && season.signupModes.includes("team");
  // Server truth wins over the URL hint: "team" on an individual-only season
  // degrades to the chooser (which itself degrades to solo when !canTeam).
  const effectiveMode = mode === "team" && !canTeam ? "choose" : mode;
  const railMode = teamToken ? "share" : effectiveMode === "team" ? "team" : "solo";

  if (effectiveMode === "choose" && canTeam) {
    return (
      <LeagueContextRail season={season} mode="solo" step={1} stepCount={4}>
        <ChooseMode season={season} canTeam={canTeam} onPick={setMode} />
      </LeagueContextRail>
    );
  }

  // Quiet mode line above step 1 — the visitor skipped (or already answered)
  // the chooser; give them a one-tap way back to it. Hidden for invite-token
  // joins (those are locked to solo-join-a-roster).
  const modeLine =
    canTeam && !teamToken ? (
      <p className="text-xs text-ink-muted mb-4">
        {effectiveMode === "team" ? "Bringing a team" : "Joining solo"}
        {" · "}
        <button
          type="button"
          onClick={() => setMode("choose")}
          className="underline underline-offset-2 hover:text-ink transition-colors"
        >
          change
        </button>
      </p>
    ) : null;

  if (effectiveMode === "team") {
    return (
      <LeagueContextRail season={season} mode="team" step={1} stepCount={4}>
        {modeLine}
        <TeamCreate
          seasonId={seasonId}
          isAuthed={!!user}
          defaultName={user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : ""}
          defaultEmail={user?.email ?? ""}
          onCaptainRegister={(tok) => {
            window.location.href = `/register/${seasonId}?team=${encodeURIComponent(tok)}`;
          }}
        />
      </LeagueContextRail>
    );
  }
  return (
    <LeagueContextRail season={season} mode={railMode} step={1} stepCount={4}>
      {modeLine}
      <RegistrationWizard
        seasonId={seasonId}
        user={user}
        audienceHint={audienceHint}
        wasCancelled={wasCancelled}
        teamToken={teamToken}
      />
    </LeagueContextRail>
  );
}
