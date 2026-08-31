"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { ChildPicker, type ChildPickerMember } from "@/components/youth/child-picker"
import { formatCents, isClassTier, type LadderTier as Tier } from "@/lib/classes/ladder-model"

/**
 * Live class-tier pricing + child join flow for /youth/classes's #pricing
 * band (Task 6). Replaces the static `<PricingCards cards={PRICING_CARDS}/>`
 * that used to live in classes.astro — fetches `/api/public/membership-tiers`
 * client-side (the enclosing page is edge-cached marketing HTML per
 * setMarketingEdgeCache, so live pricing can only ever live in an island,
 * same reasoning as class-schedule.tsx) and renders every tier whose
 * benefits imply a CLASS membership (`classes_per_month > 0` or
 * `unlimited_classes === true`) — this filters out any adult/SoccerOne-only
 * tiers (rental-discount-only, day pass, etc.) that share the same org.
 *
 * `pricing-cards.astro` (the primitive this originally reproduced) was a
 * plain Astro presentational component with no slot/island seam per-card,
 * so its markup was hand-reproduced here in React rather than reused, and
 * — with this being the primitive's only remaining consumer — the now-dead
 * `.astro` file was deleted rather than left as an orphan.
 *
 * Empty/error state: when the org has no live class tiers (or the fetch
 * fails), falls back to rendering the exact same figure-free
 * `PRICING_CARDS` content classes.astro used to render directly — moved
 * here verbatim so the page never regresses to a blank pricing band.
 *
 * Join CTA (per tier, same conventions as trial-booking.tsx):
 *  - Auth probe via `GET /api/auth/me`. Unauthed → hard redirect to
 *    `/signin?redirect=/youth/classes#pricing`.
 *  - Authed → opens the shared `ChildPicker` (child-picker.tsx,
 *    `participantKind="dependent"` — memberships are never for a `self`
 *    row) for the tier being joined.
 *  - Selecting a child immediately `POST`s `/api/memberships/subscribe`
 *    `{ tierId, billingInterval: "month", familyMemberId }` and redirects to
 *    `body.checkoutUrl` on success (MembershipTiersLive.tsx:64-86 pattern).
 *  - 409 (child already has an active membership) → inline banner + link to
 *    `/dashboard/family`, same copy/link pattern as trial-booking's
 *    `member_child_no_trial` banner.
 *
 * EMBEDDED MODE (Task 11): `class-purchase-ladder.tsx` renders this component
 * as the ladder's MEMBERSHIP rung. It passes the tiers it already fetched
 * (`tiers` prop) so the page makes one `/api/public/membership-tiers` request
 * rather than two, and sets `renderFallback={false}` — the ladder decides
 * when the figure-free `PRICING_CARDS_FALLBACK` explainer is the right thing
 * to show for the WHOLE band, and a rung rendering it on its own would
 * contradict the priced rungs above it. With no props this component still
 * behaves exactly as before (self-fetches, falls back when empty).
 *
 * Re-entrancy / stale-closure guard: `attemptSubscribe` takes `tier` and
 * `child` as explicit parameters — never reads `activeTier`/`selectedChild`
 * state inside the async continuation. This mirrors trial-booking.tsx's
 * documented `attemptBooking` bug (picking a child triggers a state update
 * that hasn't committed yet when the very next line reads it back out of a
 * frozen render closure). A monotonic `generationRef`, bumped on every close
 * and every open, guards against a stale in-flight subscribe request
 * clobbering the UI after the modal has been closed/reopened for a
 * different tier or child.
 */

type FetchPhase = "loading" | "ready" | "error"
type ModalPhase = "closed" | "picking" | "submitting"

type ErrorCode = "already_member" | "generic"

interface FlowError {
  code: ErrorCode
  message: string
}

const SIGNIN_REDIRECT = "/signin?redirect=" + encodeURIComponent("/youth/classes#pricing")

// Figure-free default state (owner-decided, 2026-08-18) — moved verbatim
// from classes.astro's PRICING_CARDS. Renders when the org has no live
// class tiers, or the tiers fetch fails, so the band never goes blank.
export const PRICING_CARDS_FALLBACK: { label: string; amount: string; body: string; hot?: boolean }[] = [
  {
    // Renders ONLY in the empty-catalog state (no packs, no block, no
    // tiers), so it must not enumerate the ladder's doors — naming options
    // that aren't currently sellable is exactly the promise this band can't
    // keep. Describe the model, let the class cards carry the figures.
    label: "Pick your commitment",
    amount: "Priced per class",
    body: "Come once, or commit to more — what's on offer moves with the schedule, and every open class card shows its own price before you book.",
  },
  {
    label: "The card is the truth",
    amount: "No separate figure",
    body: "We could publish a summary price here, but it would only be one more number to keep in sync. The price on each open class card below is the real one.",
    hot: true,
  },
  {
    label: "No surprises",
    amount: "No hidden fees",
    body: "No call required, no quote step — the price on the card is the price at checkout.",
  },
]

function benefitsLine(tier: Tier): string {
  const benefits = tier.benefits ?? {}
  let base: string
  if (benefits.unlimited_classes === true) {
    base = "Unlimited classes"
  } else if (typeof benefits.classes_per_month === "number" && benefits.classes_per_month > 0) {
    base = `${benefits.classes_per_month} class${benefits.classes_per_month === 1 ? "" : "es"} / month`
  } else {
    base = ""
  }
  const campPct =
    typeof benefits.camp_discount_pct === "number" && benefits.camp_discount_pct > 0
      ? benefits.camp_discount_pct
      : null
  if (!campPct) return base
  return base ? `${base} · ${campPct}% off camps` : `${campPct}% off camps`
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

export interface ClassTiersProps {
  /** Pre-fetched, already-filtered class tiers. When provided, the component
   *  skips its own `/api/public/membership-tiers` request — see EMBEDDED MODE
   *  in the header comment. */
  tiers?: Tier[]
  /** Render `PRICING_CARDS_FALLBACK` when there is nothing to show. Default
   *  true (standalone). The ladder passes false and owns the band-level
   *  fallback decision itself. */
  renderFallback?: boolean
}

export default function ClassTiers({
  tiers: tiersProp,
  renderFallback = true,
}: ClassTiersProps = {}) {
  const [fetchPhase, setFetchPhase] = useState<FetchPhase>(tiersProp ? "ready" : "loading")
  const [tiers, setTiers] = useState<Tier[]>(tiersProp ?? [])

  const [modalPhase, setModalPhase] = useState<ModalPhase>("closed")
  const [activeTier, setActiveTier] = useState<Tier | null>(null)
  const [selectedChild, setSelectedChild] = useState<ChildPickerMember | null>(null)
  const [flowError, setFlowError] = useState<FlowError | null>(null)

  // Monotonic generation counter — see the header comment's re-entrancy
  // section. A ref (not state) so it's readable synchronously inside async
  // continuations without waiting on a re-render, mirroring trial-booking.tsx.
  const generationRef = useRef(0)

  const isModalOpen = modalPhase !== "closed"

  useEffect(() => {
    // Embedded mode: the ladder already fetched these — keep local state in
    // sync with the prop instead of firing a second request.
    if (tiersProp) {
      setTiers(tiersProp)
      setFetchPhase("ready")
      return
    }
    let cancelled = false
    async function load() {
      try {
        const res = await fetch("/api/public/membership-tiers")
        if (!res.ok) throw new Error("bad status")
        const body = (await res.json()) as { tiers: Tier[] }
        if (cancelled) return
        const classTiers = body.tiers
          .filter(isClassTier)
          .sort((a, b) => a.displayOrder - b.displayOrder)
        setTiers(classTiers)
        setFetchPhase("ready")
      } catch {
        if (cancelled) return
        setFetchPhase("error")
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [tiersProp])

  // Defensive body-scroll lock — same rationale as trial-booking.tsx's
  // identical effect (Radix's Dialog scroll lock was observed not fully
  // engaging on this page).
  useEffect(() => {
    if (!isModalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isModalOpen])

  const openJoin = useCallback(async (tier: Tier) => {
    const myGeneration = ++generationRef.current

    let authed = false
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "same-origin" })
      const me = meRes.ok ? await meRes.json() : { user: null }
      authed = Boolean(me?.user)
    } catch {
      authed = false
    }
    if (myGeneration !== generationRef.current) return // superseded meanwhile

    if (!authed) {
      window.location.href = SIGNIN_REDIRECT
      return
    }

    setActiveTier(tier)
    setSelectedChild(null)
    setFlowError(null)
    setModalPhase("picking")
  }, [])

  function closeModal() {
    generationRef.current += 1
    setModalPhase("closed")
    setActiveTier(null)
    setSelectedChild(null)
    setFlowError(null)
  }

  /**
   * `tier` and `child` are explicit parameters — never read `activeTier` /
   * `selectedChild` state from inside this function. See the header
   * comment's re-entrancy section for the exact stale-closure failure this
   * guards against (documented first in trial-booking.tsx's
   * `attemptBooking`).
   */
  async function attemptSubscribe(tier: Tier, child: ChildPickerMember, myGeneration: number) {
    setModalPhase("submitting")
    setFlowError(null)

    let res: Response
    try {
      res = await fetch("/api/memberships/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tierId: tier.id,
          billingInterval: "month",
          familyMemberId: child.id,
        }),
      })
    } catch {
      if (myGeneration !== generationRef.current) return
      setFlowError({ code: "generic", message: "Network error — please try again." })
      setModalPhase("picking")
      return
    }

    if (myGeneration !== generationRef.current) return // modal closed/reopened while this was in flight

    if (res.ok) {
      const body = (await parseJson(res)) as { checkoutUrl?: string }
      if (myGeneration !== generationRef.current) return
      if (typeof body.checkoutUrl === "string") {
        window.location.href = body.checkoutUrl
        return
      }
      setFlowError({ code: "generic", message: "Could not start checkout — please try again." })
      setModalPhase("picking")
      return
    }

    if (res.status === 409) {
      setFlowError({
        code: "already_member",
        message: "This child already has a membership — manage it from your dashboard.",
      })
      setModalPhase("picking")
      return
    }

    const body = await parseJson(res)
    if (myGeneration !== generationRef.current) return
    setFlowError({
      code: "generic",
      message: typeof body.error === "string" ? body.error : "Could not start checkout — please try again.",
    })
    setModalPhase("picking")
  }

  function handleSelectChild(member: ChildPickerMember) {
    // Bump BEFORE starting the new attempt — invalidates any subscribe
    // request still in flight for a PREVIOUSLY selected child, same as
    // trial-booking.tsx's handleSelectChild.
    const myGeneration = ++generationRef.current
    setSelectedChild(member)
    setFlowError(null)
    // `activeTier` is read here directly (not inside the async
    // continuation) — safe because it was committed on a PRIOR render when
    // the modal was opened, well before this synchronous click handler runs.
    if (!activeTier) return
    // `member` is passed directly — never `selectedChild` (the state var);
    // see attemptSubscribe's and the header comment's stale-closure note.
    void attemptSubscribe(activeTier, member, myGeneration)
  }

  if (fetchPhase === "loading") {
    return <LoadingSkeleton variant="card" />
  }

  const showFallback = renderFallback && (fetchPhase === "error" || tiers.length === 0)
  // Embedded with nothing to show: render nothing at all, rather than an
  // empty <div> that would still consume the band's grid gap.
  if (!showFallback && tiers.length === 0) return null

  return (
    <div>
      {showFallback ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRICING_CARDS_FALLBACK.map((card) => (
            <div
              key={card.label}
              className={
                card.hot
                  ? "bg-navy-deep text-cream border border-navy-deep rounded-2xl p-[26px] flex flex-col"
                  : "bg-paper text-ink border border-cream-3 rounded-2xl p-[26px] flex flex-col"
              }
            >
              <p
                className={`font-mono text-[10px] tracking-[0.16em] uppercase ${card.hot ? "text-cream/70" : "text-ink-muted"}`}
              >
                {card.label}
              </p>
              <p className="font-display font-semibold text-[34px] mt-[10px]">{card.amount}</p>
              <p className={`text-[13.5px] mt-[10px] flex-1 ${card.hot ? "text-cream/85" : "text-ink-2"}`}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiers.map((tier, i) => {
            // Middle tier (by displayOrder) reads as "best value" — same
            // navy-deep highlight convention as pricing-cards.astro's `hot`
            // and the pathway cards above on this page. Only applied once
            // there's more than one tier to contrast against.
            const hot = tiers.length > 1 && i === Math.floor((tiers.length - 1) / 2)
            const monthly = formatCents(tier.monthlyPriceCents)
            const fee = formatCents(tier.annualFeeCents)
            const benefits = benefitsLine(tier)
            return (
              <div
                key={tier.id}
                className={
                  hot
                    ? "bg-navy-deep text-cream border border-navy-deep rounded-2xl p-[26px] flex flex-col"
                    : "bg-paper text-ink border border-cream-3 rounded-2xl p-[26px] flex flex-col"
                }
              >
                <p
                  className={`font-mono text-[10px] tracking-[0.16em] uppercase ${hot ? "text-cream/70" : "text-ink-muted"}`}
                >
                  {tier.name}
                </p>
                <p className="font-display font-semibold text-[34px] mt-[10px]">
                  {monthly ?? "—"}
                  <small
                    className={`font-sans font-normal text-[12.5px] ml-1 ${hot ? "text-cream/70" : "text-ink-muted"}`}
                  >
                    {" "}
                    / mo
                  </small>
                </p>
                {fee && (
                  <p className={`text-[12px] mt-1 ${hot ? "text-cream/70" : "text-ink-muted"}`}>
                    + {fee}/yr membership fee
                  </p>
                )}
                {tier.tagline && (
                  <p className={`text-[13.5px] mt-[10px] flex-1 ${hot ? "text-cream/85" : "text-ink-2"}`}>
                    {tier.tagline}
                  </p>
                )}
                {benefits && (
                  <p className={`text-[13px] font-medium mt-3 ${hot ? "text-cream" : "text-ink"}`}>{benefits}</p>
                )}
                <button
                  type="button"
                  data-youth-cta="pricing"
                  onClick={() => void openJoin(tier)}
                  className={
                    hot
                      ? "inline-block mt-[18px] font-semibold text-[13px] px-4 py-[9px] rounded-[8px] bg-cream text-ink no-underline"
                      : "inline-block mt-[18px] font-semibold text-[13px] px-4 py-[9px] rounded-[8px] bg-brand-red text-cream no-underline"
                  }
                >
                  Join {tier.name} →
                </button>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="bg-paper border-cream-3 text-ink max-w-md max-h-[85vh] overflow-y-auto">
          {activeTier && (
            <>
              <DialogTitle className="text-ink">Join {activeTier.name}</DialogTitle>
              <DialogDescription className="text-ink-muted">
                Pick which child this membership is for.
              </DialogDescription>

              {flowError && (
                <div className="space-y-1.5">
                  <ErrorBanner message={flowError.message} />
                  {flowError.code === "already_member" && (
                    <a href="/dashboard/family" className="inline-block font-medium text-ochre hover:underline">
                      Go to your dashboard →
                    </a>
                  )}
                </div>
              )}

              {/* relative + overlay so the "submitting" phase is visibly
                  busy — same convention as trial-booking.tsx's booking
                  overlay. */}
              <div className="relative">
                <ChildPicker
                  ageRange={{ minAge: null, maxAge: null }}
                  selectedId={selectedChild?.id ?? null}
                  onSelect={handleSelectChild}
                  disabled={modalPhase === "submitting"}
                  participantKind="dependent"
                />
                {modalPhase === "submitting" && (
                  <div
                    className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-paper/85 text-sm font-medium text-ink-2"
                    role="status"
                    aria-live="polite"
                  >
                    <div
                      className="size-4 rounded-full border-2 border-ochre border-t-transparent animate-spin"
                      aria-hidden="true"
                    />
                    Starting checkout…
                  </div>
                )}
              </div>

              <p className="text-xs text-ink-muted">
                10% sibling discount applies automatically at checkout for additional children.
              </p>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
