"use client"

import { Calendar, MapPin, ArrowRight, User, Users, Clock } from "lucide-react"
import {
  deriveStatusPill,
  deriveIndividualUnit,
  deriveDuration,
  deriveAudience,
  isDualMode,
  isTeamOnly,
  deriveSignupMode,
  type SeasonForDerive,
} from "@/lib/programs/derive"
import { formatDaySchedule, formatTimeWindow, formatDateOnly } from "@/lib/time/format-date"
import { sportColor } from "@/lib/design/sport-colors"
import { CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit"
import { SeasonInterestForm } from "./season-interest-form"
import { CardShell, STRETCHED_LINK_CLASSES } from "./card-shell"
import { VenueLink } from "./venue-link"

interface Season extends SeasonForDerive {
  id: string
  name: string
  slug: string
  status?: string
  signupMode?: string
  price: number
  teamPrice: number | null
  earlyBirdPrice?: number | null
  earlyBirdTeamPrice?: number | null
  earlyBirdDeadline?: string | null
  spotsLeft?: number | null
  deposit?: number | null
  allowDeposit?: boolean
  scheduleNotes: string | null
  dayOfWeek?: string | null
  startTime?: string | null
  endTime?: string | null
  sport: { name: string; slug: string; icon: string | null; color: string | null }
  location: { name: string; slug: string; city: string | null }
  ageGroup: { name: string; minAge: number; maxAge: number } | null
}

/**
 * Card heading rule: a generic season name ("Summer 2026") is prefixed with
 * the program name so adult visitors scanning many cards can tell leagues
 * apart. Specific names ("Memorial Day Premier — Summer 2026") are used as-is.
 */
function isGenericSeasonName(name: string): boolean {
  // Only a bare "Season YYYY" (no division/detail suffix) needs the program name
  // prepended. "Fall 2026 — Men's D" is self-describing — render it as-is.
  return /^(Spring|Summer|Fall|Winter)\s+\d{4}$/i.test(name.trim())
}

const STATUS_PILL_STYLES: Record<string, string> = {
  open: "bg-emerald-50 text-emerald-700",
  filling: "bg-amber-100 text-amber-800",
  // Scarcity ("{n} spots left") — amber per the catalog spec.
  last: "bg-amber-100 text-amber-800",
  // Forming — same ochre/amber treatment the inline pill used pre-refactor.
  forming: "bg-amber-100 text-ink-2",
  // Sold out — dark, unambiguous.
  soldout: "bg-ink text-cream",
}

/** Price figure with optional early-bird strike-through of the base price. */
function PriceFigure({ price, basePrice }: { price: number; basePrice: number | null }) {
  return (
    <div className="font-display text-lg text-ink leading-none">
      ${price.toLocaleString()}
      {basePrice != null && (
        <span className="ml-1.5 text-xs text-ink-faint line-through">
          ${basePrice.toLocaleString()}
        </span>
      )}
    </div>
  )
}

export default function ProgramCardV2({
  season,
  emphasis,
}: {
  season: Season
  /**
   * "team" — captain-audience presentation (the catalog's "A team" segment):
   * dual-mode cards lead with the team offer ("$200 down · $1,000 total"
   * column first, solo second) and "Reserve a team · $200" takes the
   * primary/filled CTA position with "Sign up solo" secondary. Team-only
   * cards already lead with the team offer, and every other audience renders
   * pixel-identical to the default.
   */
  emphasis?: "team"
}) {
  const status = deriveStatusPill(season)
  const indivUnit = deriveIndividualUnit(season)
  const duration = deriveDuration(season)
  const dual = isDualMode(season)
  const teamOnly = isTeamOnly(season)
  const signupMode = deriveSignupMode(season)
  const audience = deriveAudience(season)

  const programName = (season.program as { name?: string }).name ?? ""
  const headingName =
    isGenericSeasonName(season.name) && programName
      ? `${programName} — ${season.name}`
      : season.name

  // Normalized content contract — every line always resolves.
  const venueLabel = season.location.name.replace(/^Soccer One\s+/i, "")
  const audienceLabel = season.ageGroup
    ? season.ageGroup.name
    : season.program.audienceType === "adults"
      ? "Adult"
      : "All ages"
  // Structured day/time wins ("Saturdays · 9–10am"); a bare time window
  // ("6–11pm") covers seasons with times but no play day; the derived duration
  // is the floor. Every card also states when it starts.
  const dayTime =
    formatDaySchedule(season.dayOfWeek, season.startTime, season.endTime) ||
    formatTimeWindow(season.startTime, season.endTime)
  const startsLabel = `starts ${formatDateOnly(season.startDate, { month: "short", day: "numeric" })}`
  const cardSportColor = sportColor(season.sport)

  // One format badge, hard cap. Priority: dual > team-only > non-league type.
  let formatBadge: string | null = null
  if (dual) formatBadge = "Solo or team"
  else if (teamOnly) formatBadge = "Team only"
  else if (season.program.programType !== "league")
    formatBadge =
      season.program.programType.charAt(0).toUpperCase() +
      season.program.programType.slice(1)

  const headlinePrice = teamOnly && season.teamPrice != null ? season.teamPrice : season.price
  const headlineUnit = teamOnly ? "per team" : indivUnit

  // Sold out — only meaningful on registerable cards (forming seasons already
  // collect interest). spotsLeft is null when the season is uncapped.
  const soldOut = signupMode === "register" && season.spotsLeft === 0

  // Early-bird display: only while the deadline is in the future, and only
  // when the discounted price actually undercuts the base (mirrors the guard
  // in src/lib/programs/early-bird.ts — an "early-bird" at/above list price
  // is a misconfiguration and must not render). Suppressed on sold-out cards.
  const ebInFuture =
    season.earlyBirdDeadline != null &&
    new Date(season.earlyBirdDeadline).getTime() > Date.now()
  const soloEb =
    !soldOut &&
    ebInFuture &&
    season.earlyBirdPrice != null &&
    season.earlyBirdPrice > 0 &&
    season.earlyBirdPrice < season.price
      ? season.earlyBirdPrice
      : null
  const teamEb =
    !soldOut &&
    ebInFuture &&
    season.earlyBirdTeamPrice != null &&
    season.earlyBirdTeamPrice > 0 &&
    season.teamPrice != null &&
    season.earlyBirdTeamPrice < season.teamPrice
      ? season.earlyBirdTeamPrice
      : null
  const singleEb = teamOnly ? teamEb : soloEb
  const ebLabel =
    soloEb != null || teamEb != null
      ? `Early-bird · ends ${new Date(season.earlyBirdDeadline as string).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`
      : null

  // Deposit note — the season's own deposit gates whether the note shows at
  // all (allowDeposit + a real partial amount). For the ADULT TEAM wording the
  // dollar figure is CAPTAIN_DEPOSIT_DOLLARS ($200) from
  // src/lib/registrations/team-deposit.ts — that constant is what the
  // team-create flow actually charges, so it is authoritative for the team
  // path; season.deposit only governs the individual deposit checkout.
  const depositValid =
    season.allowDeposit === true &&
    season.deposit != null &&
    season.deposit > 0 &&
    season.deposit < headlinePrice
  const teamPath = dual || teamOnly
  // Team story is keyed on the team offer itself (teamPath + a real teamPrice),
  // NOT on season.deposit — that field only governs the individual
  // deposit-checkout and used to make this note appear/disappear on unrelated
  // admin data. Youth/individual hold-a-spot notes still key on depositValid.
  const depositNote =
    !soldOut && signupMode === "register"
      ? teamPath && season.teamPrice != null
        ? `$${CAPTAIN_DEPOSIT_DOLLARS.toLocaleString()} reserves your team — split the rest with your roster`
        : depositValid
          ? audience === "youth"
            ? `$${season.deposit!.toLocaleString()} holds a spot today`
            : `$${season.deposit!.toLocaleString()} holds your spot today`
          : null
      : null

  // CTA labels by audience.
  const soloCta = audience === "youth" ? "Register your kid" : dual ? "Sign up solo" : "Register"
  const teamCta =
    audience === "adult" ? `Reserve a team · $${CAPTAIN_DEPOSIT_DOLLARS}` : "Register team"

  // Captain-audience presentation — only reorders the dual-mode layout.
  const teamFirst = emphasis === "team" && dual && season.teamPrice != null
  const effTeamTotal = season.teamPrice != null ? (teamEb ?? season.teamPrice) : null

  return (
    <CardShell
      sportColor={cardSportColor}
      mediaBottomLeft={
        <span className="absolute bottom-2 left-3 text-[10px] font-bold uppercase tracking-wide text-white/90">
          {season.sport.icon ? `${season.sport.icon} ` : ""}
          {season.sport.name}
        </span>
      }
      mediaTopRight={
        <span
          className={`absolute top-2 right-2 inline-flex items-center text-[10px] font-semibold tracking-wide uppercase px-2 py-0.5 rounded-full ${STATUS_PILL_STYLES[status.tone]}`}
        >
          {status.label}
        </span>
      }
      title={headingName}
      metaA={
        // Venue (linked to its location page) · age · format. Every season
        // resolves all three; a genuinely missing single value renders an
        // em-dash rather than dropping the row.
        <>
          <MapPin className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">
            <VenueLink slug={season.location.slug} label={venueLabel} />
            {" · "}
            {audienceLabel}
          </span>
        </>
      }
      metaB={
        // Day + time, always resolves (structured day/time wins; a bare time
        // window is next; the derived duration is the floor)
        <>
          <Clock className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{dayTime || duration}</span>
        </>
      }
      metaC={
        // Start date, always resolves
        <>
          <Calendar className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{startsLabel}</span>
        </>
      }
      chip={
        // Format pill (dual/team-only signal) and/or early-bird chip; empty
        // for the default youth solo case. Reserved height (shell) keeps
        // cards aligned regardless of chip count.
        <>
          {formatBadge && (
            <span className="inline-flex items-center font-semibold tracking-wide uppercase text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">
              {formatBadge}
            </span>
          )}
          {ebLabel && (
            <span className="text-[10px] font-semibold tracking-wide uppercase text-primary">
              {ebLabel}
            </span>
          )}
        </>
      }
      footer={
        // Price band + CTA — dual-mode keeps two actions; forming seasons
        // show interest-capture; sold-out seasons show the waitlist form
        signupMode === "interest" ? (
          <div className="mt-3">
            <SeasonInterestForm seasonId={season.id} seasonName={season.name} />
          </div>
        ) : (
          <div className="pt-3 border-t border-border">
            {dual && season.teamPrice != null ? (
                <>
                  {(() => {
                    // Column order: solo leads by default; the captain
                    // audience (emphasis="team") leads with the team offer
                    // framed as deposit-down + effective total.
                    const soloCol = (
                      <div key="solo" className={teamFirst ? "border-l border-border pl-3" : undefined}>
                        <PriceFigure
                          price={soloEb ?? season.price}
                          basePrice={soloEb != null ? season.price : null}
                        />
                        <div className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                          {indivUnit}
                        </div>
                      </div>
                    )
                    const teamCol = (
                      <div key="team" className={teamFirst ? undefined : "border-l border-border pl-3"}>
                        <PriceFigure price={CAPTAIN_DEPOSIT_DOLLARS} basePrice={null} />
                        <div className="text-[10px] text-ink-muted mt-1 uppercase tracking-wide font-semibold">
                          down · ${effTeamTotal!.toLocaleString()} total
                        </div>
                      </div>
                    )
                    return (
                      <div className="grid grid-cols-2 gap-3 mb-3">
                        {teamFirst ? [teamCol, soloCol] : [soloCol, teamCol]}
                      </div>
                    )
                  })()}
                  {depositNote && (
                    <p className="text-[11px] text-ink-muted mb-3 leading-snug">{depositNote}</p>
                  )}
                  {soldOut ? (
                    <WaitlistBlock seasonId={season.id} seasonName={season.name} />
                  ) : (
                    (() => {
                      // teamFirst puts the filled "Reserve a team" CTA in the
                      // primary (first) position with "Sign up solo"
                      // secondary — and the stretched whole-card link follows
                      // the same primary slot; the secondary CTA gets
                      // `relative z-10` so it stacks above the stretch.
                      const soloBtn = (
                        <a
                          key="solo-cta"
                          href={`/register/${season.id}?mode=individual`}
                          className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide uppercase border border-ink text-ink hover:bg-ink hover:text-cream px-3 py-2 rounded-md transition-colors ${teamFirst ? "relative z-10" : STRETCHED_LINK_CLASSES}`}
                        >
                          <User className="w-3.5 h-3.5" />
                          {soloCta}
                        </a>
                      )
                      const teamBtn = (
                        <a
                          key="team-cta"
                          href={`/register/${season.id}?mode=team`}
                          className={`inline-flex items-center justify-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream hover:bg-primary px-3 py-2 rounded-md transition-colors ${teamFirst ? STRETCHED_LINK_CLASSES : "relative z-10"}`}
                        >
                          <Users className="w-3.5 h-3.5" />
                          {teamCta}
                        </a>
                      )
                      return (
                        <div className="grid grid-cols-2 gap-2">
                          {teamFirst ? [teamBtn, soloBtn] : [soloBtn, teamBtn]}
                        </div>
                      )
                    })()
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-end justify-between">
                    <div>
                      <PriceFigure
                        price={singleEb ?? headlinePrice}
                        basePrice={singleEb != null ? headlinePrice : null}
                      />
                      <div className="text-[11px] text-ink-muted mt-1">{headlineUnit}</div>
                    </div>
                    {!soldOut && (
                      <a
                        href={teamOnly ? `/register/${season.id}?mode=team` : `/register/${season.id}`}
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase bg-ink text-cream px-3 py-2 rounded-md group-hover:bg-primary transition-colors ${STRETCHED_LINK_CLASSES}`}
                      >
                        {teamOnly ? teamCta : soloCta}
                        <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                      </a>
                    )}
                  </div>
                  {soldOut ? (
                    <div className="mt-3">
                      <WaitlistBlock seasonId={season.id} seasonName={season.name} />
                    </div>
                  ) : (
                    depositNote && (
                      <p className="text-[11px] text-ink-muted mt-2 leading-snug">{depositNote}</p>
                    )
                  )}
                </>
              )}
            </div>
          )
      }
    />
  )
}

/** Sold-out replacement for the register CTAs: join-waitlist interest capture.
 *  Reuses the season-interest mechanism (idempotent per season+email). */
function WaitlistBlock({ seasonId, seasonName }: { seasonId: string; seasonName: string }) {
  return (
    <div>
      <p className="text-xs text-ink-muted mb-2">
        <span className="font-semibold text-ink">Join waitlist</span> — we&apos;ll email you
        if a spot opens.
      </p>
      <SeasonInterestForm seasonId={seasonId} seasonName={seasonName} />
    </div>
  )
}
