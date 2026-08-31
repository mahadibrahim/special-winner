"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { ChildPicker, type ChildPickerMember } from "@/components/youth/child-picker"
import ClassTiers, { PRICING_CARDS_FALLBACK } from "@/components/youth/class-tiers"
import {
  assembleLadder,
  formatCents,
  ladderSummarySentence,
  type BlockRungTemplate,
  type BlockWindow,
  type LadderModel,
  type LadderPack,
  type LadderScheduleSlot,
  type LadderTier,
  type PackRungItem,
} from "@/lib/classes/ladder-model"

/**
 * The /youth/classes #pricing band: FOUR ways into a class, cheapest
 * commitment first — drop-in, pack, block, membership. Replaces the
 * membership-only `<ClassTiers />` that used to be the whole band (which
 * quietly implied a monthly membership was the only door).
 *
 * WHY AN ISLAND: the enclosing page is edge-cached marketing HTML
 * (setMarketingEdgeCache in classes.astro), so anything computed in the Astro
 * frontmatter freezes into the cached response for up to a day. Live catalog
 * pricing can only ever live client-side — same reasoning as
 * class-schedule.tsx and the ClassTiers band before it.
 *
 * DATA: four parallel anonymous GETs (`/api/public/class-packs`,
 * `/api/public/class-blocks`, `/api/public/membership-tiers`,
 * `/api/public/class-schedule`), reduced to rung view-models by the pure
 * `assembleLadder` in src/lib/classes/ladder-model.ts (unit-tested there —
 * this file holds no pricing logic).
 *
 * FAIL-SOFT: each fetch settles independently; a failed or empty one yields
 * an empty list, and `assembleLadder` simply omits that rung. When packs,
 * block AND tiers are all empty the band renders the figure-free
 * `PRICING_CARDS_FALLBACK` explainer (imported from class-tiers.tsx, still
 * its owner) rather than a blank section or invented figures.
 *
 * HONEST HEADER: because three of the four rungs are catalog-dependent, the
 * enclosing section's h2/lede in classes.astro are deliberately neutral —
 * they neither count nor name the doors. The enumeration is `ladderSummary
 * Sentence(model.rungs)`, rendered here from what actually assembled, so an
 * empty catalog can never leave the page promising four ways in above two.
 *
 * MEMBERSHIP RUNG: `<ClassTiers />` itself, handed the tiers this component
 * already fetched (`tiers` prop → no duplicate request) with
 * `renderFallback={false}`. It stays the membership rung's checkout engine —
 * its child-picker/subscribe flow is not duplicated here.
 *
 * DROP-IN RUNG: a from-price plus a jump to #schedule. Booking a single
 * session needs a specific DATE, which only the schedule band has, so the
 * actual door lives on those cards (class-schedule.tsx's "Book · $X").
 *
 * PURCHASE FLOWS (packs, block) follow class-tiers.tsx's established shape
 * verbatim: auth probe via `GET /api/auth/me` → hard redirect to
 * `/signin?redirect=…` when signed out → `ChildPicker`
 * (`participantKind="dependent"`) → POST → `window.location.href = url`.
 *
 * Re-entrancy: `attemptPurchase` takes the target and child as explicit
 * PARAMETERS and never reads them back out of state inside its async
 * continuation, and a monotonic `generationRef` (bumped on every open, close
 * and child selection) invalidates a request still in flight after the modal
 * moved on. Both guard the exact stale-closure bug documented in
 * trial-booking.tsx's `attemptBooking`.
 */

const SIGNIN_REDIRECT = "/signin?redirect=" + encodeURIComponent("/youth/classes#pricing")

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function formatWeekdayTime(weekday: number, startTime: string): string {
  const day = WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`
  const [hourStr, minuteStr] = startTime.slice(0, 5).split(":")
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `${day} · ${startTime.slice(0, 5)}`
  const period = hour >= 12 ? "PM" : "AM"
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${day} · ${hour12}:${String(minute).padStart(2, "0")} ${period}`
}

/** "2026-09-15" → "Sep 15". Parsed as a plain civil date (no `new
 *  Date("...")` UTC-midnight shift, which renders the previous day west of
 *  Greenwich). */
function formatCivilDate(date: string): string {
  const [y, m, d] = date.split("-").map(Number)
  if (!y || !m || !d) return date
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function expiryLine(expiryMonths: number | null): string | null {
  if (expiryMonths === null || expiryMonths <= 0) return null
  return expiryMonths === 1 ? "Use within 1 month" : `Use within ${expiryMonths} months`
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

/** Resolves to [] on ANY failure — a rung's absence is the fail-soft state. */
async function fetchList<T>(url: string, pick: (body: Record<string, unknown>) => T[]): Promise<T[]> {
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    return pick(await parseJson(res)) ?? []
  } catch {
    return []
  }
}

type FetchPhase = "loading" | "ready"
type ModalPhase = "closed" | "picking" | "submitting"

/** What the open modal is buying. Discriminated so one picker + one submit
 *  path serves both purchase endpoints. */
type PurchaseTarget =
  | { kind: "pack"; pack: PackRungItem }
  | { kind: "block"; blockId: string; blockName: string; template: BlockRungTemplate }

/**
 * Every `error` value from either purchase endpoint that a parent should
 * actually SEE, mapped to copy they can act on.
 *
 * Two envelopes are folded into one table. The BLOCK endpoint returns
 * snake_case machine codes alongside a human `message`; the PACK endpoint
 * returns a bare human-ish sentence in `error` and no `message` at all. An
 * allow-list rather than a shape heuristic ("does it contain a space?") is
 * deliberate: the pack endpoint's `error` strings also include operational
 * ones — "Stripe not configured", "Could not create Stripe customer", "No
 * organization context" — which are true, useless to a parent, and leak how
 * the payment stack is wired. Anything not listed here falls through to the
 * generic retry line.
 */
const PURCHASE_ERROR_COPY: Record<string, string> = {
  // Block endpoint — machine codes.
  block_over: "This class has no sessions left in the current block — pick another day.",
  template_full: "That class just filled up — pick another day.",
  already_enrolled: "This child already has a seat in that class — see it on your dashboard.",
  rate_mismatch: "That class is priced differently — reload the page and try again.",
  class_rate_not_configured: "This class is missing its pricing — contact the front desk.",
  age_ineligible: "That class is outside this child's age range — pick another.",
  // Pack endpoint — sentence-shaped `error` values.
  "Pack not found": "That pack isn't available any more — reload the page and try again.",
  "Pack is not purchasable": "That pack isn't on sale right now — reload the page and try again.",
  "Family member not found":
    "We couldn't find that child on your account — reload the page and try again.",
  "Block not found": "That block isn't available any more — reload the page and try again.",
  "Class not found": "That class isn't available any more — reload the page and try again.",
}

const GENERIC_PURCHASE_ERROR = "Could not start checkout — please try again."

/**
 * Best available human message from either purchase endpoint's error body.
 * Order: allow-listed copy for a known `error` value → the endpoint's own
 * `message` (block-endpoint-only, and always customer-facing copy: "This
 * class is full", "This child is outside the age range for this class") →
 * generic. An unrecognised `error` is never rendered verbatim.
 */
function purchaseErrorMessage(payload: Record<string, unknown>): string {
  const error = typeof payload.error === "string" ? payload.error : null
  if (error && PURCHASE_ERROR_COPY[error]) return PURCHASE_ERROR_COPY[error]
  if (typeof payload.message === "string" && payload.message.length > 0) return payload.message
  return GENERIC_PURCHASE_ERROR
}

export default function ClassPurchaseLadder() {
  useHydrationBeacon()

  const [fetchPhase, setFetchPhase] = useState<FetchPhase>("loading")
  const [model, setModel] = useState<LadderModel>({ rungs: [], showFallback: true })

  const [modalPhase, setModalPhase] = useState<ModalPhase>("closed")
  const [target, setTarget] = useState<PurchaseTarget | null>(null)
  const [selectedChild, setSelectedChild] = useState<ChildPickerMember | null>(null)
  const [flowError, setFlowError] = useState<string | null>(null)

  // A ref (not state) so async continuations can read it synchronously
  // without waiting on a re-render — same guard as class-tiers.tsx.
  const generationRef = useRef(0)
  const isModalOpen = modalPhase !== "closed"

  useEffect(() => {
    let cancelled = false
    async function load() {
      // Four independent fetches, all fail-soft — Promise.all is safe here
      // precisely because no branch of fetchList ever rejects.
      const [packs, blockList, tiers, scheduleSlots] = await Promise.all([
        fetchList<LadderPack>("/api/public/class-packs", (b) => (b.packs as LadderPack[]) ?? []),
        fetchList<BlockWindow>("/api/public/class-blocks", (b) =>
          b.block ? [b.block as BlockWindow] : [],
        ),
        fetchList<LadderTier>("/api/public/membership-tiers", (b) => (b.tiers as LadderTier[]) ?? []),
        fetchList<LadderScheduleSlot>("/api/public/class-schedule", (b) =>
          (b.slots as LadderScheduleSlot[]) ?? [],
        ),
      ])
      if (cancelled) return
      setModel(assembleLadder({ packs, block: blockList[0] ?? null, tiers, scheduleSlots }))
      setFetchPhase("ready")
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  // Defensive body-scroll lock — Radix's own lock was observed not fully
  // engaging on this page (same effect as trial-booking/class-tiers).
  useEffect(() => {
    if (!isModalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [isModalOpen])

  const openPurchase = useCallback(async (next: PurchaseTarget) => {
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
    setTarget(next)
    setSelectedChild(null)
    setFlowError(null)
    setModalPhase("picking")
  }, [])

  function closeModal() {
    generationRef.current += 1
    setModalPhase("closed")
    setTarget(null)
    setSelectedChild(null)
    setFlowError(null)
  }

  /**
   * `purchase` and `child` are explicit parameters — never read `target` /
   * `selectedChild` state from inside this function (see the header
   * comment's re-entrancy note).
   */
  async function attemptPurchase(
    purchase: PurchaseTarget,
    child: ChildPickerMember,
    myGeneration: number,
  ) {
    setModalPhase("submitting")
    setFlowError(null)

    const url =
      purchase.kind === "pack" ? "/api/classes/packs/purchase" : "/api/classes/blocks/purchase"
    const body: Record<string, string> =
      purchase.kind === "pack"
        ? { packProductId: purchase.pack.id, familyMemberId: child.id }
        : {
            blockId: purchase.blockId,
            slotTemplateId: purchase.template.slotTemplateId,
            familyMemberId: child.id,
          }

    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    } catch {
      if (myGeneration !== generationRef.current) return
      setFlowError("Network error — please try again.")
      setModalPhase("picking")
      return
    }
    if (myGeneration !== generationRef.current) return // modal moved on mid-flight

    const payload = await parseJson(res)
    // Re-check AFTER the second await too — the modal can close/reopen while
    // the body is still being read (the race payForClass documents).
    if (myGeneration !== generationRef.current) return

    if (res.ok) {
      if (typeof payload.url === "string" && payload.url.length > 0) {
        window.location.href = payload.url
        return
      }
      setFlowError(GENERIC_PURCHASE_ERROR)
      setModalPhase("picking")
      return
    }

    setFlowError(purchaseErrorMessage(payload))
    setModalPhase("picking")
  }

  function handleSelectChild(member: ChildPickerMember) {
    // Bump BEFORE starting the new attempt — invalidates any request still
    // in flight for a PREVIOUSLY selected child.
    const myGeneration = ++generationRef.current
    setSelectedChild(member)
    setFlowError(null)
    // `target` was committed on a prior render (when the modal opened), so
    // reading it in this synchronous click handler is safe; `member` is
    // passed through rather than read back from state.
    if (!target) return
    void attemptPurchase(target, member, myGeneration)
  }

  if (fetchPhase === "loading") {
    return <LoadingSkeleton variant="card" rows={3} />
  }

  // Derived, never hard-coded: the enclosing section's h2/lede deliberately
  // don't count or name the doors, because three of the four rungs are
  // catalog-dependent. This sentence names exactly what rendered.
  const summary = ladderSummarySentence(model.rungs)

  return (
    <div className="space-y-[46px]">
      {/* Negative top margin cancels most of the section wrapper's mt-[38px]
          so this reads as the second line of the lede above it, not an
          orphan paragraph floating over the first rung. */}
      {summary && <p className="text-[15.5px] text-ink-2 -mt-[26px]">{summary}</p>}

      {model.rungs.map((rung) => {
        switch (rung.kind) {
          case "dropin":
            return (
              <Rung
                key="dropin"
                label="One class"
                title="Just come once."
                lede="Try a single class at its own price — no membership, no block, nothing to cancel."
              >
                <div className="bg-paper text-ink border border-cream-3 rounded-2xl p-[26px] flex flex-col sm:flex-row sm:items-center gap-5">
                  <p className="font-display font-semibold text-[34px] leading-none">
                    From {formatCents(rung.fromPriceCents)}
                    <small className="font-sans font-normal text-[12.5px] text-ink-muted ml-1.5">
                      per class
                    </small>
                  </p>
                  <p className="text-[13.5px] text-ink-2 flex-1">
                    Every class on this week's schedule below shows its own price and what's left —
                    pick a date and book it.
                  </p>
                  <a
                    href="#schedule"
                    data-youth-cta="ladder-dropin"
                    className="shrink-0 inline-block font-semibold text-[13px] px-4 py-[9px] rounded-[8px] bg-brand-red text-cream no-underline"
                  >
                    See this week →
                  </a>
                </div>
              </Rung>
            )

          case "packs":
            return (
              <Rung
                key="packs"
                label="Class packs"
                title="Buy a few, use them when you can."
                lede="Credits for one child. Book any class on the schedule with them — no fixed night, no monthly bill."
              >
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {rung.packs.map((pack, i) => {
                    const hot = rung.packs.length > 1 && i === Math.floor((rung.packs.length - 1) / 2)
                    const perSession = formatCents(pack.perSessionCents)
                    const expiry = expiryLine(pack.expiryMonths)
                    return (
                      <div key={pack.id} className={hot ? CARD_HOT : CARD_PLAIN}>
                        <p className={hot ? LABEL_HOT : LABEL_PLAIN}>{pack.name}</p>
                        <p className="font-display font-semibold text-[34px] mt-[10px]">
                          {formatCents(pack.priceCents)}
                        </p>
                        <p className={`text-[13.5px] mt-[10px] flex-1 ${hot ? "text-cream/85" : "text-ink-2"}`}>
                          {pack.sessionCount} class{pack.sessionCount === 1 ? "" : "es"}
                          {perSession ? ` — that's ${perSession} each` : ""}.
                          {expiry ? ` ${expiry}.` : ""}
                        </p>
                        <button
                          type="button"
                          data-youth-cta="ladder-pack"
                          data-ladder-pack={pack.id}
                          onClick={() => void openPurchase({ kind: "pack", pack })}
                          className={hot ? CTA_HOT : CTA_PLAIN}
                        >
                          Buy {pack.sessionCount} classes →
                        </button>
                      </div>
                    )
                  })}
                </div>
              </Rung>
            )

          case "block": {
            const { block } = rung
            const window = `${formatCivilDate(block.startDate)} – ${formatCivilDate(block.endDate)}`
            return (
              <Rung
                key="block"
                label={block.name}
                title={block.upcoming ? "Take the whole term." : "Join the term already running."}
                // The "you only pay for the weeks left" promise lives on the
                // CARD, not here — it is true per template (a slot whose
                // weekday has all its sessions still to come is not
                // prorated), so stating it band-wide would over-claim.
                lede={
                  block.upcoming
                    ? `${window} — one night a week, the same group and the same coach the whole way through.`
                    : `${window} — one night a week with the same group, already under way. Pick your night.`
                }
              >
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {block.templates.map((t) => (
                    <div key={t.slotTemplateId} className={CARD_PLAIN}>
                      <p className={LABEL_PLAIN}>{formatWeekdayTime(t.weekday, t.startTime)}</p>
                      <h4 className="font-display font-semibold text-[19px] mt-1.5">{t.name}</h4>
                      <p className="font-display font-semibold text-[30px] mt-2.5">
                        {formatCents(t.proratedPriceCents)}
                        {t.midBlock && (
                          <small className="font-sans font-normal text-[12.5px] text-ink-muted ml-1.5">
                            {" "}
                            was {formatCents(t.fullPriceCents)}
                          </small>
                        )}
                      </p>
                      <p className="text-[13.5px] text-ink-2 mt-2 flex-1">
                        {t.remainingSessions === 0
                          ? `No sessions left this term — ${t.totalSessions} ran.`
                          : t.midBlock
                            ? `${t.remainingSessions} of ${t.totalSessions} sessions left — you only pay for the weeks left.`
                            : `${t.totalSessions} session${t.totalSessions === 1 ? "" : "s"}.`}
                        {t.venueName ? ` ${t.venueName}.` : ""}
                      </p>
                      {t.purchasable ? (
                        <>
                          <p className="text-[12px] text-ink-muted mt-2">
                            {t.spotsLeft} spot{t.spotsLeft === 1 ? "" : "s"} left
                          </p>
                          <button
                            type="button"
                            data-youth-cta="ladder-block"
                            data-ladder-block-template={t.slotTemplateId}
                            onClick={() =>
                              void openPurchase({
                                kind: "block",
                                blockId: block.id,
                                blockName: block.name,
                                template: t,
                              })
                            }
                            className={CTA_PLAIN}
                          >
                            Take this class →
                          </button>
                        </>
                      ) : (
                        <p className="font-medium text-[13px] text-ink-muted mt-[18px]">
                          {t.spotsLeft === 0 ? "Full for this term" : "Closed for this term"}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </Rung>
            )
          }

          case "membership":
            return (
              <Rung
                key="membership"
                label="Monthly membership"
                title="Train every week, all year."
                lede="A set number of classes every month, plus member pricing on everything else. Cancel any time."
              >
                <ClassTiers tiers={rung.tiers} renderFallback={false} />
              </Rung>
            )
        }
      })}

      {model.showFallback && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRICING_CARDS_FALLBACK.map((card) => (
            <div key={card.label} className={card.hot ? CARD_HOT : CARD_PLAIN}>
              <p className={card.hot ? LABEL_HOT : LABEL_PLAIN}>{card.label}</p>
              <p className="font-display font-semibold text-[34px] mt-[10px]">{card.amount}</p>
              <p className={`text-[13.5px] mt-[10px] flex-1 ${card.hot ? "text-cream/85" : "text-ink-2"}`}>
                {card.body}
              </p>
            </div>
          ))}
        </div>
      )}

      <Dialog open={isModalOpen} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent className="bg-paper border-cream-3 text-ink max-w-md max-h-[85vh] overflow-y-auto">
          {target && (
            <>
              <DialogTitle className="text-ink">
                {target.kind === "pack"
                  ? `Buy ${target.pack.name}`
                  : `${target.template.name} — ${target.blockName}`}
              </DialogTitle>
              <DialogDescription className="text-ink-muted">
                {target.kind === "pack"
                  ? `Pick which child these ${target.pack.sessionCount} classes are for.`
                  : `${formatCents(target.template.proratedPriceCents)} for ${
                      target.template.remainingSessions
                    } session${target.template.remainingSessions === 1 ? "" : "s"} — pick which child this seat is for.`}
              </DialogDescription>

              <ErrorBanner message={flowError} />

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
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared card/CTA classes — one place so the four rungs read as one system.
// Tailwind utilities only: Astro scoped styles never reach a React island.
// ---------------------------------------------------------------------------

const CARD_PLAIN = "bg-paper text-ink border border-cream-3 rounded-2xl p-[26px] flex flex-col"
const CARD_HOT = "bg-navy-deep text-cream border border-navy-deep rounded-2xl p-[26px] flex flex-col"
const LABEL_PLAIN = "font-mono text-[10px] tracking-[0.16em] uppercase text-ink-muted"
const LABEL_HOT = "font-mono text-[10px] tracking-[0.16em] uppercase text-cream/70"
const CTA_PLAIN =
  "inline-block mt-[18px] font-semibold text-[13px] px-4 py-[9px] rounded-[8px] bg-brand-red text-cream no-underline self-start"
const CTA_HOT =
  "inline-block mt-[18px] font-semibold text-[13px] px-4 py-[9px] rounded-[8px] bg-cream text-ink no-underline self-start"

/**
 * One rung: mono label (the only place a label is allowed — it names the
 * purchase model, which is real information, not an eyebrow/kicker), serif
 * sub-header with a brand-red tinted closing phrase, full-width lede (no
 * measure cap — owner rule), then the rung's cards.
 */
function Rung({
  label,
  title,
  lede,
  children,
}: {
  label: string
  title: string
  lede: string
  children: React.ReactNode
}) {
  // Split on the last space so the closing word carries the red tint, the
  // same header grammar the page's h2s use.
  const cut = title.lastIndexOf(" ")
  const head = cut > 0 ? title.slice(0, cut) : title
  const tail = cut > 0 ? title.slice(cut + 1) : null

  return (
    <section className="scroll-mt-24">
      <p className="font-mono text-[10.5px] tracking-[0.16em] uppercase text-emerald-700">{label}</p>
      <h3 className="font-display font-semibold tracking-tight text-ink text-[26px] sm:text-[30px] mt-1.5">
        {head} {tail && <span className="text-brand-red">{tail}</span>}
      </h3>
      <p className="text-[15.5px] text-ink-2 mt-2">{lede}</p>
      <div className="mt-[22px]">{children}</div>
    </section>
  )
}
