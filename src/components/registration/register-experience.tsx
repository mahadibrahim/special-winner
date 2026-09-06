"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import LeagueContextRail, { type RailSeason, type RailStep } from "./league-context-rail";
import ChooseMode from "./choose-mode";
import TeamCreate from "./team-create";
import RegistrationWizard from "./registration-wizard";
import { InAppEscapeBanner } from "./in-app-escape-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyNotifyForm } from "@/components/landing/empty-notify-form";
import { trackRegistrationBlocked } from "@/lib/analytics/events";

type AuthedUser = React.ComponentProps<typeof RegistrationWizard>["user"];

export default function RegisterExperience({
  seasonId,
  user,
  audienceHint,
  wasCancelled,
  teamToken,
  modeHint,
  stripePublishableKey,
}: {
  seasonId: string;
  user: AuthedUser;
  audienceHint: string | null;
  wasCancelled: boolean;
  teamToken: string | null;
  /** ?mode= from catalog cards ("individual" | "team") — skips ChooseMode
      when the visitor already picked on the card they clicked. */
  modeHint?: string | null;
  /** Stripe publishable key, threaded from the Astro page's server env so the
      deferred payment Element can mount on the client (the key is server-only
      otherwise). */
  stripePublishableKey: string;
}) {
  useHydrationBeacon();
  const [season, setSeason] = useState<
    | (RailSeason & {
        signupModes: string | null;
        status: string;
        registrationClosed?: boolean;
        // Detail endpoint's sport.slug — used to send the closed-state "Back
        // to leagues" link to the right sport rather than a generic fallback.
        sport: { color: string | null; slug: string | null };
        // Same adult-detection field registration-wizard.tsx uses — needed
        // here so the closed-state bail-outs can tell an adult season from
        // a youth one even when the URL never carried ?audience=.
        ageGroup: { minAge: number } | null;
      })
    | null
  >(null);
  const [err, setErr] = useState<string | null>(null);
  // Invite-link rail truth: the captain-assigned share (never the solo
  // price) and team name for an invite-link visitor. Resolved best-effort
  // from the team-token endpoint below — failure just leaves these null and
  // the rail/wizard fall back to their own defaults, no error UI.
  const [viewerShareCents, setViewerShareCents] = useState<number | null>(null);
  const [teamName, setTeamName] = useState<string | null>(null);
  // Precedence: an invite token always means solo-join-a-roster; then the
  // catalog card's ?mode= hint; then the explicit chooser. A "team" hint is
  // re-checked against server truth below (canTeam) — a hand-edited URL on an
  // individual-only season falls back to the chooser rather than rendering
  // TeamCreate for a season that can't take teams.
  const [mode, setMode] = useState<"choose" | "solo" | "team">(
    teamToken ? "solo" : modeHint === "individual" ? "solo" : modeHint === "team" ? "team" : "choose",
  );
  // Personal invite-email links carry `?i=<inviteeId>` so the (possibly
  // signed-out) recipient's exact assigned share can be resolved without
  // requiring auth. Read once at mount — window is unavailable during this
  // island's server render, hence the guard.
  const [inviteeRef] = useState<string | null>(() =>
    typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("i") : null,
  );

  // Live wizard step, lifted from the child flows so the rail's progress bar
  // reflects where the visitor actually is (it used to be hard-pinned to 1/4).
  // Team: 1 details → 2 reserve → 3 register yourself → 4 invite (optional).
  const [teamStep, setTeamStep] = useState(1);
  const [teamDiscountCents, setTeamDiscountCents] = useState<number | null>(null);
  const [soloFlow, setSoloFlow] = useState<{ step: number; count: number }>({ step: 1, count: 3 });
  // Stable identity + bail-out-on-unchanged: the wizard's reporting effect
  // depends on this callback's identity, and setSoloFlow with a fresh object
  // every call would loop (parent re-render → new callback → effect re-fires).
  const handleSoloStep = useCallback((step: number, count: number) => {
    setSoloFlow((prev) => (prev.step === step && prev.count === count ? prev : { step, count }));
  }, []);

  // Resolve the real assigned share (never the solo price) + team name for
  // an invite-link visitor. Best-effort: any failure just leaves both null,
  // no error UI — the rail/wizard fall back to their own defaults.
  useEffect(() => {
    if (!teamToken) return;
    const qs = inviteeRef ? `?invitee=${encodeURIComponent(inviteeRef)}` : "";
    fetch(`/api/public/team-registrations/${encodeURIComponent(teamToken)}${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("not_found");
        const body = await r.json();
        // An explicit invitee share wins; otherwise the captain-set join
        // price (if any) is what this visitor will actually be charged —
        // mirror of resolveTeamPricing in create-registration.ts.
        setViewerShareCents(
          body.viewerShare?.shareCents ?? body.payment?.joinShareCents ?? null,
        );
        setTeamName(body.team?.teamName ?? null);
      })
      .catch(() => {
        setViewerShareCents(null);
        setTeamName(null);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamToken]);

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
      modeHint === "individual" &&
      season.signupModes &&
      !season.signupModes.includes("individual")
    ) {
      setMode("choose");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  // Register-page dead-ends (audit F5): the season isn't open yet, or
  // registration has closed. Both bail-outs below were silent — fire once
  // per mount so the funnel shows where visitors actually stop.
  const blockedTrackedRef = useRef(false);
  useEffect(() => {
    if (!season || blockedTrackedRef.current) return;
    if (season.status !== "open") {
      blockedTrackedRef.current = true;
      trackRegistrationBlocked({ seasonId, reason: "not_open" });
    } else if (season.registrationClosed) {
      blockedTrackedRef.current = true;
      trackRegistrationBlocked({ seasonId, reason: "closed" });
    }
  }, [season, seasonId]);

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
  // Closed-state capture (audit F6): both bail-outs below used to be a bare
  // message and a dead end. Now they also offer an email-capture (the same
  // finder empty-state pattern as EmptyNotifyForm's other callers) and a way
  // back into the catalog — pinned to this season's own sport when the
  // detail payload carries one, falling back to soccer's league page
  // otherwise (the only sport with a stable /youth/leagues/<slug> page today).
  // This component also serves ADULT season bail-outs (adult flag-football
  // closes seasonally). audienceHint alone is unreliable — it comes only
  // from ?audience= on the URL, which the division tables/cards never set,
  // so an adult season reached via a card click had no signal at all. Mirror
  // the adultSelfFlow predicate from registration-wizard.tsx:261 — fall back
  // to the season's own ageGroup.minAge when the hint is absent.
  const isAdultSeason = audienceHint === "adult" || (season.ageGroup?.minAge ?? 0) >= 18;
  const backToLeaguesHref = isAdultSeason ? "/adult/leagues" : `/youth/leagues/${season.sport?.slug || "soccer"}`;
  const notifyAudience = isAdultSeason ? "adult" : "parent";
  if (season.status !== "open")
    return (
      <div className="space-y-4">
        <ErrorBanner message="Registration for this division isn't open." />
        <EmptyNotifyForm audience={notifyAudience} source="league-closed" />
        <a href={backToLeaguesHref} className="inline-block text-sm font-medium text-ochre hover:underline">
          ← Back to leagues
        </a>
      </div>
    );
  if (season.registrationClosed)
    return (
      <div className="space-y-4">
        <ErrorBanner message="Registration for this season has closed. Contact us if you'd like to join a roster mid-season." />
        <EmptyNotifyForm audience={notifyAudience} source="league-closed" />
        <a href={backToLeaguesHref} className="inline-block text-sm font-medium text-ochre hover:underline">
          ← Back to leagues
        </a>
      </div>
    );

  const canTeam = !!season.signupModes && season.signupModes.includes("team");
  // Server truth wins over the URL hint: "team" on an individual-only season
  // degrades to the chooser (which itself degrades to solo when !canTeam).
  const effectiveMode = mode === "team" && !canTeam ? "choose" : mode;
  const railMode = teamToken ? "share" : effectiveMode === "team" ? "team" : "solo";

  if (effectiveMode === "choose" && canTeam) {
    return (
      <LeagueContextRail season={season} mode="solo" step={1} stepCount={4}>
        {/* #460: the chooser is the FIRST screen an Instagram/Facebook
            visitor sees on a team-capable season — without the banner here
            they had no escape hatch until one screen later. */}
        <InAppEscapeBanner seasonId={seasonId} />
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
      <LeagueContextRail season={season} mode="team" step={teamStep} stepCount={TEAM_STEPS.length} steps={TEAM_STEPS} discountCents={teamDiscountCents}>
        <InAppEscapeBanner seasonId={seasonId} />
        {modeLine}
        <TeamCreate
          seasonId={seasonId}
          isAuthed={!!user}
          defaultName={user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() : ""}
          defaultEmail={user?.email ?? ""}
          season={season}
          onStepChange={setTeamStep}
          onDiscountChange={setTeamDiscountCents}
          stripePublishableKey={stripePublishableKey}
        />
      </LeagueContextRail>
    );
  }
  // Solo/share: unlabeled progress of the real step count, so the bar tracks
  // the wizard instead of sitting frozen at 1/4.
  const soloSteps: RailStep[] = Array.from({ length: soloFlow.count }, () => ({ label: "" }));
  return (
    <LeagueContextRail season={season} mode={railMode} step={soloFlow.step} stepCount={soloFlow.count} steps={soloSteps} shareCents={viewerShareCents}>
      <InAppEscapeBanner seasonId={seasonId} />
      {modeLine}
      <RegistrationWizard
        seasonId={seasonId}
        user={user}
        audienceHint={audienceHint}
        wasCancelled={wasCancelled}
        teamToken={teamToken}
        inviteeShareCents={viewerShareCents}
        teamName={teamName}
        stripePublishableKey={stripePublishableKey}
        onStepChange={handleSoloStep}
      />
    </LeagueContextRail>
  );
}

// Team flow steps for the rail. The captain is auto-registered on the roster at
// deposit, so the flow is just 2 steps: reserve (details + payment on one
// screen), then optionally invite the roster.
const TEAM_STEPS: RailStep[] = [
  { label: "Reserve" },
  { label: "Invite roster", optional: true },
];
