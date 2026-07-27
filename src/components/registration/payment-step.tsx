"use client"

import { Tag, CheckCircle2, AlertCircle, Loader2, X, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { OrderSummary } from "./order-summary"
import { EmbeddedPayment, type CreateIntentResult } from "./embedded-payment"
import { InAppEscapePrompt } from "./in-app-escape-prompt"
import { computeSurchargeCents } from "@/lib/payments/surcharge"
import type { SeasonItem, CheckoutPaymentType } from "@/lib/analytics/datalayer"

interface AppliedDiscount {
  code: string
  discountType: "percentage" | "fixed_amount"
  discountValue: number
  discountAmountCents: number
}

/** Captain deposit credit (server-computed, display-only — see
 *  viewerCaptainCredit on GET /api/public/team-registrations/[token]).
 *  Present only when the registrant is the captain of the team behind the
 *  invite token and the $200 deposit is paid. */
export interface CaptainCreditView {
  shareCents: number
  creditCents: number
  dueCents: number
  depositCents: number
}

export interface PaymentStepProps {
  seasonName: string
  seasonPrice: number
  seasonPriceCents: number
  seasonDeposit: number | null
  seasonDepositCents: number | null
  allowDeposit: boolean
  /** True while the season's early-bird window is live — seasonPrice/seasonPriceCents already carry the discounted price. */
  earlyBirdActive?: boolean
  paymentOption: "full" | "deposit"
  registrantName: string

  /** Captain deposit credit — replaces the season-price summary with the
   *  credit math (Your share / Deposit credit / Total due today). Typical
   *  result is $0 due, which renders a single "Complete registration" button
   *  and never creates a Stripe intent. */
  captainCredit?: CaptainCreditView | null
  /** Finalize a $0-due registration (captain deposit credit, or a discount
   *  that zeroes the bill). Server recomputes the amount; no payment method,
   *  no Stripe session. */
  onCompleteZeroDue?: () => void

  /** Team-invite share amount (server-resolved, from the personal invite
   *  ref) — when set, the "Pay in Full" tile shows this amount labeled
   *  "Your share — set by your captain" instead of the solo season price,
   *  and the deposit option is not offered (shares are paid in full). */
  teamShareCents?: number | null
  /** True when a personal team invite promised a share amount but the
   *  server didn't apply it (email didn't match the invite) — renders an
   *  explanatory notice above the payment options. */
  shareMismatch?: boolean

  /** True while a $0-due "Complete registration" is being finalized. */
  isCreatingSession: boolean

  // Discount state
  discountCodeInput: string
  isValidatingDiscount: boolean
  discountError: string | null
  appliedDiscount: AppliedDiscount | null

  onPaymentOptionChange: (v: "full" | "deposit") => void
  onDiscountCodeInputChange: (v: string) => void
  onApplyDiscount: () => void
  onRemoveDiscount: () => void

  // Account-credit state. creditBalanceCents is 0 for guest checkout (no
  // signed-in user to hold a balance) or when the user simply has no
  // credit — either way the toggle just doesn't render.
  creditBalanceCents: number
  applyAccountCredit: boolean
  onApplyAccountCreditChange: (v: boolean) => void

  // Deferred embedded-payment wiring. The card form mounts inline and
  // immediately; the registration row + PaymentIntent are created only when
  // the customer clicks Pay, via createIntent.
  /** Creates the registration + PaymentIntent on Pay and returns the new
   *  client secret (or an error). Card-only, deferred. */
  createIntent: () => Promise<CreateIntentResult>
  publishableKey: string
  seasonItem: SeasonItem | null
  checkoutPaymentType: CheckoutPaymentType
  paymentReturnUrl: string
  onPaymentSuccess: (paymentIntentId: string) => void
  onPaymentCancel: () => void
}

export function PaymentStep({
  seasonName,
  seasonPrice,
  seasonPriceCents,
  seasonDeposit,
  seasonDepositCents,
  allowDeposit,
  earlyBirdActive = false,
  paymentOption,
  captainCredit = null,
  onCompleteZeroDue,
  teamShareCents = null,
  shareMismatch = false,
  isCreatingSession,
  registrantName,
  discountCodeInput,
  isValidatingDiscount,
  discountError,
  appliedDiscount,
  onPaymentOptionChange,
  onDiscountCodeInputChange,
  onApplyDiscount,
  onRemoveDiscount,
  creditBalanceCents,
  applyAccountCredit,
  onApplyAccountCreditChange,
  createIntent,
  publishableKey,
  seasonItem,
  checkoutPaymentType,
  paymentReturnUrl,
  onPaymentSuccess,
  onPaymentCancel,
}: PaymentStepProps) {
  // The deposit option is only offered when the deposit is a genuine partial
  // payment — strictly less than the amount the pay-in-full option charges
  // (the early-bird-aware seasonPrice). Seasons have carried a team-sized
  // deposit (e.g. $200) alongside a $120 solo price; rendering it would show
  // "Remaining $-80.00" and charge more than paying in full. Server twin:
  // registrationAmountDueCents in src/lib/registrations/amount-due.ts.
  // Team-share registrations are always paid in full — the invite promised
  // an exact share, and a partial "deposit" against it isn't a concept the
  // server supports (there's no per-share deposit split).
  const depositAvailable =
    teamShareCents == null &&
    allowDeposit &&
    seasonDeposit != null &&
    seasonDepositCents != null &&
    seasonDepositCents > 0 &&
    seasonDepositCents < seasonPriceCents
  // Guard against stale state (e.g. a restored draft that picked "deposit"
  // before the deposit became invalid): all display math and the order
  // summary fall back to pay-in-full when the deposit isn't offered.
  const effectivePaymentOption = depositAvailable ? paymentOption : "full"

  // Compute the live payable total so the deferred Elements can mount with the
  // exact amount before the customer clicks Pay. A captain credit replaces the
  // season price with the post-credit due.
  const baseAmountCents = captainCredit
    ? captainCredit.dueCents
    : teamShareCents != null
      ? teamShareCents
      : effectivePaymentOption === "deposit" && seasonDepositCents
        ? seasonDepositCents
        : seasonPriceCents
  const discountedBaseCents = appliedDiscount
    ? Math.max(0, baseAmountCents - appliedDiscount.discountAmountCents)
    : baseAmountCents
  // Credit is applied after the discount, before surcharge — matches the
  // server (createCheckoutForRegistration applies credit right before
  // creating the Stripe session, so the surcharge Stripe actually computes
  // is on the post-credit amount).
  const previewCreditAppliedCents = applyAccountCredit
    ? Math.min(creditBalanceCents, discountedBaseCents)
    : 0
  const amountAfterCreditCents = Math.max(
    0,
    discountedBaseCents - previewCreditAppliedCents,
  )
  // Card-only checkout: the surcharge is always the card-processor fee.
  const cardSurchargeCents = computeSurchargeCents(amountAfterCreditCents, "card")
  // The exact amount the card form charges — feeds the deferred Elements
  // `valueCents` and the Pay button, and must equal the server-created
  // PaymentIntent amount for stripe.confirmPayment to succeed.
  const payableTotalCents = amountAfterCreditCents + cardSurchargeCents

  // Zero-due path: a captain deposit credit (or a discount) fully covers the
  // bill — one "Complete registration" button, no card form, no Stripe intent.
  const captainZeroDue = captainCredit != null && captainCredit.dueCents === 0
  const zeroDue = payableTotalCents === 0

  return (
    <div className="space-y-6">
      {/* A personal team invite promised a share amount, but the server
          didn't apply it (registering email didn't match the invite) — the
          season full price is about to be charged instead. Explain why
          before the customer confirms. */}
      {shareMismatch && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            This email doesn't match your team invite, so your captain's
            share amount didn't apply. Register with the invited email, or
            ask your captain to re-invite this one.
          </p>
        </div>
      )}

      {/* Captain deposit credit — replaces the season-price option/summary
          sections entirely: one credit source, one clear total. */}
      {captainCredit && (
        <div>
          <h3 className="text-lg font-semibold text-ink mb-2">Your share</h3>
          <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
            <div className="flex items-center justify-between mb-2">
              <span className="text-ink-2">Registration for</span>
              <span className="text-ink font-medium">{registrantName}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-ink-2">Your share</span>
              <span className="text-ink">
                ${(captainCredit.shareCents / 100).toFixed(2)}
              </span>
            </div>
            <div className="flex items-center justify-between mb-2 text-green-400">
              <span>Deposit credit</span>
              <span>-${(captainCredit.creditCents / 100).toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-primary/20">
              <span className="text-ink font-semibold">Total due today</span>
              <span className="text-ink font-bold text-xl">
                ${(captainCredit.dueCents / 100).toFixed(2)}
              </span>
            </div>
            {captainZeroDue && (
              <p className="text-xs text-ink-muted mt-2">
                Covered by your ${(captainCredit.depositCents / 100).toFixed(0)}{" "}
                team deposit — the remainder stays credited to the team fee.
              </p>
            )}
          </div>
        </div>
      )}

      {!captainCredit && (
      <>
      <div>
        <h3 className="text-lg font-semibold text-ink mb-2">Payment Option</h3>
        <p className="text-ink-muted text-sm">
          Choose how you'd like to pay for this registration.
        </p>
      </div>

      <RadioGroup
        value={effectivePaymentOption}
        onValueChange={(v) => onPaymentOptionChange(v as "full" | "deposit")}
      >
        <div className="space-y-3">
          <Label
            htmlFor="pay-full"
            className={`flex items-center p-4 rounded-xl border transition-all cursor-pointer ${
              effectivePaymentOption === "full"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-ink-faint bg-paper"
            }`}
          >
            <RadioGroupItem value="full" id="pay-full" className="mr-4" />
            <div className="flex-1">
              <p className="font-medium text-ink">
                {teamShareCents != null ? "Your share — set by your captain" : "Pay in Full"}
              </p>
              <p className="text-sm text-ink-muted">Complete payment now</p>
            </div>
            <div className="text-right">
              {earlyBirdActive && teamShareCents == null && (
                <p className="text-xs font-medium text-primary">Early-bird</p>
              )}
              <div className="text-xl font-bold text-ink">
                ${teamShareCents != null ? (teamShareCents / 100).toFixed(2) : seasonPrice}
              </div>
            </div>
          </Label>

          {depositAvailable && seasonDeposit != null && (
            <Label
              htmlFor="pay-deposit"
              className={`flex items-center p-4 rounded-xl border transition-all cursor-pointer ${
                effectivePaymentOption === "deposit"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-ink-faint bg-paper"
              }`}
            >
              <RadioGroupItem value="deposit" id="pay-deposit" className="mr-4" />
              <div className="flex-1">
                <p className="font-medium text-ink">Pay Deposit</p>
                <p className="text-sm text-ink-muted">
                  Remaining ${(seasonPrice - seasonDeposit).toFixed(2)} due before season starts
                </p>
              </div>
              <div className="text-xl font-bold text-ink">${seasonDeposit}</div>
            </Label>
          )}
        </div>
      </RadioGroup>

      {/* Discount Code */}
      <div className="space-y-3">
        <Label className="text-ink-muted flex items-center gap-2">
          <Tag className="w-4 h-4" />
          Discount Code
        </Label>
        {appliedDiscount ? (
          <div className="flex items-center justify-between p-3 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" />
              <span className="text-green-400 font-medium">{appliedDiscount.code}</span>
              <span className="text-green-400/70 text-sm">
                (-${(appliedDiscount.discountAmountCents / 100).toFixed(2)})
              </span>
            </div>
            <button
              type="button"
              onClick={onRemoveDiscount}
              className="text-ink-muted hover:text-ink p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={discountCodeInput}
              onChange={(e) => {
                onDiscountCodeInputChange(e.target.value.toUpperCase())
              }}
              placeholder="Enter code"
              className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint uppercase"
            />
            <Button
              type="button"
              variant="outline"
              onClick={onApplyDiscount}
              disabled={!discountCodeInput.trim() || isValidatingDiscount}
              className="border-border text-ink-2 hover:text-ink hover:bg-cream-2 px-6"
            >
              {isValidatingDiscount ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Apply"
              )}
            </Button>
          </div>
        )}
        {discountError && (
          <p className="text-sm text-red-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            {discountError}
          </p>
        )}
      </div>

      {/* Account credit — hidden entirely for guest checkout / no balance,
          since creditBalanceCents is 0 in both cases. */}
      {creditBalanceCents > 0 && (
        <label className="flex items-center justify-between p-3 rounded-lg border border-border bg-paper cursor-pointer">
          <span className="flex items-center gap-2">
            <Checkbox
              checked={applyAccountCredit}
              onCheckedChange={(v) => onApplyAccountCreditChange(v === true)}
            />
            <span className="text-sm text-ink">
              Apply my ${(creditBalanceCents / 100).toFixed(2)} account credit
            </span>
          </span>
        </label>
      )}

      {/* Order Summary — team-share registrations show the share amount
          (the same value the "Pay in Full" tile above renders), never the
          solo season price. */}
      <OrderSummary
        seasonName={seasonName}
        seasonPrice={teamShareCents != null ? teamShareCents / 100 : seasonPrice}
        seasonDeposit={seasonDeposit}
        allowDeposit={allowDeposit}
        earlyBirdActive={teamShareCents != null ? false : earlyBirdActive}
        paymentOption={effectivePaymentOption}
        registrantName={registrantName}
        appliedDiscount={appliedDiscount}
        surchargeCents={cardSurchargeCents}
        paymentMethodCategory="card"
        creditAppliedCents={previewCreditAppliedCents}
      />
      </>
      )}

      {/* Zero-due completion — no payment method, no Stripe intent. The server
          recomputes the credit/discount and finalizes the row as paid. */}
      {zeroDue && (
        <div className="space-y-3">
          <Button
            onClick={() => onCompleteZeroDue?.()}
            disabled={isCreatingSession}
            className="w-full bg-primary hover:bg-primary/90 py-6 text-base font-semibold"
          >
            {isCreatingSession ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Completing…
              </>
            ) : (
              "Complete registration"
            )}
          </Button>
          <div className="text-center">
            <button
              type="button"
              onClick={onPaymentCancel}
              disabled={isCreatingSession}
              className="text-sm text-ink-muted hover:text-ink underline underline-offset-2 disabled:opacity-60"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Inline deferred card form — mounts immediately whenever there's an
          amount to charge. The registration row + PaymentIntent are created
          only on Pay (createIntent), so visitors who reach this step but
          never pay leave nothing behind. */}
      {!zeroDue && seasonItem && (
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-ink">Payment Details</h3>
            <span className="inline-flex items-center gap-1 text-xs text-ink-muted">
              <Lock className="w-3 h-3" aria-hidden="true" />
              Secure checkout — powered by Stripe
            </span>
          </div>
          <InAppEscapePrompt seasonId={seasonItem.id} />
          <EmbeddedPayment
            createIntent={createIntent}
            publishableKey={publishableKey}
            seasonItem={seasonItem}
            valueCents={payableTotalCents}
            paymentType={checkoutPaymentType}
            coupon={appliedDiscount?.code}
            returnUrl={paymentReturnUrl}
            onSuccess={onPaymentSuccess}
            onCancel={onPaymentCancel}
          />
          <p className="mt-3 text-xs text-ink-faint text-center">
            Refunds: full refund until 14 days before the season ·{" "}
            <a
              href="/refund-policy"
              target="_blank"
              rel="noopener"
              className="underline underline-offset-2 hover:text-ink transition-colors"
            >
              Refund policy
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
