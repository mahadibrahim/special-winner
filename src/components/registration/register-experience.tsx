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
}: {
  seasonId: string;
  user: AuthedUser;
  audienceHint: string | null;
  wasCancelled: boolean;
  teamToken: string | null;
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
  const [mode, setMode] = useState<"choose" | "solo" | "team">(teamToken ? "solo" : "choose");

  useEffect(() => {
    fetch(`/api/public/seasons/${seasonId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not_found");
        const body = await r.json();
        setSeason(body.season); // detail endpoint wraps in { season }
      })
      .catch(() => setErr("We couldn't load this league. It may be closed."));
  }, [seasonId]);

  if (err) return <ErrorBanner message={err} />;
  if (!season) return <LoadingSkeleton />;
  if (season.status !== "open")
    return <ErrorBanner message="Registration for this division isn't open." />;
  if (season.registrationClosed)
    return <ErrorBanner message="Registration for this season has closed. Contact us if you'd like to join a roster mid-season." />;

  const canTeam = !!season.signupModes && season.signupModes.includes("team");
  const railMode = teamToken ? "share" : mode === "team" ? "team" : "solo";

  if (mode === "choose" && canTeam) {
    return (
      <LeagueContextRail season={season} mode="solo" step={1} stepCount={4}>
        <ChooseMode season={season} canTeam={canTeam} onPick={setMode} />
      </LeagueContextRail>
    );
  }
  if (mode === "team") {
    return (
      <LeagueContextRail season={season} mode="team" step={1} stepCount={4}>
        <TeamCreate
          seasonId={seasonId}
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
