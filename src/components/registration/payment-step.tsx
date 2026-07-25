"use client"

import { Tag, CheckCircle2, AlertCircle, Loader2, X, Landmark, CreditCard, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { OrderSummary } from "./order-summary"
import { EmbeddedPayment } from "./embedded-payment"
import { computeSurchargeCents } from "@/lib/payments/surcharge"
import type { SeasonItem, CheckoutPaymentType } from "@/lib/analytics/datalayer"

// ACH/bank debit is disabled — checkout is card-only. The bank branch in
// createCheckoutSession (client.ts) and the ACH surcharge-preview math below
// are left in place but unreachable; flip this to true to re-enable the bank
// option (and its "no fee" path) without rebuilding the flow.
const ACH_ENABLED = false

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
  /** Finalize a $0-due captain-credit registration (server recomputes the
   *  credit; no payment method, no Stripe session). */
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

  // Payment-method category (the bank-vs-card choice that drives surcharge).
  paymentMethodCategory: "bank" | "card"
  /**
   * Commit to a payment method. Selecting a method is the single action that
   * creates the registration + Stripe session and reveals the inline payment
   * form below — there's no separate "continue" step. Re-selecting the other
   * method recreates the session for that method.
   */
  onMethodSelected: (category: "bank" | "card") => void
  /** True while the registration + Stripe session is being created. */
  isCreatingSession: boolean
  /**
   * Locks the full/deposit choice once the registration has been created
   * (its amount is fixed for the rest of the wizard). Stays locked even after
   * the customer hits "Change" on the method, since the row already exists.
   */
  optionLocked: boolean
  /** Server-confirmed surcharge applied to the active session, in cents. */
  appliedSurchargeCents: number

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
  /** Server-confirmed credit applied to the active session, in cents. */
  appliedCreditCents: number

  // Embedded-payment props — when clientSecret is set, renders the
  // payment form below the order summary. When null, the method picker
  // shows instead.
  clientSecret: string | null
  publishableKey: string | null
  seasonItem: SeasonItem | null
  paymentValueCents: number
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
  paymentMethodCategory,
  onMethodSelected,
  isCreatingSession,
  optionLocked,
  appliedSurchargeCents,
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
  appliedCreditCents,
  clientSecret,
  publishableKey,
  seasonItem,
  paymentValueCents,
  checkoutPaymentType,
  paymentReturnUrl,
  onPaymentSuccess,
  onPaymentCancel,
}: PaymentStepProps) {
  // Once we have a clientSecret the payment form is mounted; the picker
  // collapses to a one-line summary (the customer changes method via "Change",
  // which recreates the session). The amount is fixed for the live session, so
  // the payment option + discount are locked until they go back.
  const sessionLocked = clientSecret !== null

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

  // Zero-due captain path: the deposit fully covers the captain's share —
  // one "Complete registration" button, no method picker, no Stripe intent.
  const captainZeroDue = captainCredit != null && captainCredit.dueCents === 0

  // Compute a preview surcharge for each method group so the picker can show
  // exactly what each option costs before the customer commits. A captain
  // credit replaces the season price with the post-credit due.
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
  const previewCardSurcharge = computeSurchargeCents(amountAfterCreditCents, "card")

  // Display surcharge: post-commit, use the server-confirmed value so we can't
  // get out of sync with what Stripe actually charged.
  const displaySurchargeCents = sessionLocked
    ? appliedSurchargeCents
    : paymentMethodCategory === "card"
      ? previewCardSurcharge
      : 0

  // Display credit applied: post-commit, use the server-confirmed value
  // (returned by the checkout endpoint) so it can't drift from what was
  // actually redeemed.
  const displayCreditAppliedCents = sessionLocked
    ? appliedCreditCents
    : previewCreditAppliedCents

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
        disabled={optionLocked}
      >
        <div className="space-y-3">
          <Label
            htmlFor="pay-full"
            className={`flex items-center p-4 rounded-xl border transition-all ${
              optionLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            } ${
              effectivePaymentOption === "full"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-ink-faint bg-paper"
            }`}
          >
            <RadioGroupItem value="full" id="pay-full" className="mr-4" disabled={optionLocked} />
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
              className={`flex items-center p-4 rounded-xl border transition-all ${
                optionLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
              } ${
                effectivePaymentOption === "deposit"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-ink-faint bg-paper"
              }`}
            >
              <RadioGroupItem value="deposit" id="pay-deposit" className="mr-4" disabled={optionLocked} />
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
            {!sessionLocked && (
              <button
                type="button"
                onClick={onRemoveDiscount}
                className="text-ink-muted hover:text-ink p-1"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <Input
              value={discountCodeInput}
              onChange={(e) => {
                onDiscountCodeInputChange(e.target.value.toUpperCase())
              }}
              placeholder="Enter code"
              disabled={sessionLocked}
              className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint uppercase"
            />
            <Button
              type="button"
              variant="outline"
              onClick={onApplyDiscount}
              disabled={!discountCodeInput.trim() || isValidatingDiscount || sessionLocked}
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
        <label
          className={`flex items-center justify-between p-3 rounded-lg border border-border bg-paper ${
            sessionLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
          }`}
        >
          <span className="flex items-center gap-2">
            <Checkbox
              checked={applyAccountCredit}
              onCheckedChange={(v) => onApplyAccountCreditChange(v === true)}
              disabled={sessionLocked}
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
        surchargeCents={displaySurchargeCents}
        paymentMethodCategory={paymentMethodCategory}
        creditAppliedCents={displayCreditAppliedCents}
      />
      </>
      )}

      {/* Zero-due captain completion — no payment method, no Stripe intent.
          The server recomputes the credit and finalizes the row as paid. */}
      {captainZeroDue && !sessionLocked && (
        <div className="space-y-3">
          <Button
            onClick={onCompleteZeroDue}
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
        </div>
      )}

      {/* Payment method — selecting one creates the session and reveals the
          inline payment form. No separate "continue to payment" step. */}
      {!sessionLocked && !captainZeroDue && (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-ink mb-1">Payment Method</h3>
            <p className="text-ink-muted text-sm">
              {ACH_ENABLED
                ? "Pick a method to enter your payment details. Bank transfer is free; card payments include the processor fee."
                : "Pay securely by card or wallet — Visa, Mastercard, Apple Pay, or Google Pay."}
            </p>
            {/* Trust signals BEFORE the commit tap — replays showed hesitation
                right here, and the refund promise previously appeared only
                after a method was already selected. */}
            <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <Lock className="w-3 h-3" aria-hidden="true" />
                Secure checkout — powered by Stripe
              </span>
              <span aria-hidden="true">·</span>
              <span>
                Full refund until 14 days before the season ·{" "}
                <a href="/refund-policy" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-ink">
                  Refund policy
                </a>
              </span>
            </p>
          </div>
          {/* Card/wallet leads. Card-only for now — the bank option below is
              gated off (ACH_ENABLED=false) but kept one flag-flip away for the
              fee-averse; grid collapses to one column while it's hidden. */}
          <div className={`grid gap-3 ${ACH_ENABLED ? "sm:grid-cols-2" : ""}`}>
            <button
              type="button"
              onClick={() => onMethodSelected("card")}
              disabled={isCreatingSession}
              aria-pressed={paymentMethodCategory === "card"}
              className={`text-left flex items-start gap-3 p-4 rounded-xl border transition-all disabled:opacity-60 disabled:cursor-wait ${
                paymentMethodCategory === "card"
                  ? "border-primary bg-primary/10"
                  : "border-border hover:border-ink-faint bg-paper"
              }`}
            >
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="w-4 h-4 text-ink-2" />
                  <p className="font-medium text-ink">Card or wallet</p>
                  {previewCardSurcharge > 0 && (
                    <span className="ml-auto text-xs font-medium text-ink-2 bg-ink/5 px-2 py-0.5 rounded-full">
                      +${(previewCardSurcharge / 100).toFixed(2)} fee
                    </span>
                  )}
                </div>
                <p className="text-sm text-ink-muted">
                  Fastest — Apple Pay, Google Pay, or any card.
                </p>
              </div>
            </button>
            {ACH_ENABLED && (
              <button
                type="button"
                onClick={() => onMethodSelected("bank")}
                disabled={isCreatingSession}
                aria-pressed={paymentMethodCategory === "bank"}
                className={`text-left flex items-start gap-3 p-4 rounded-xl border transition-all disabled:opacity-60 disabled:cursor-wait ${
                  paymentMethodCategory === "bank"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-ink-faint bg-paper"
                }`}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Landmark className="w-4 h-4 text-primary" />
                    <p className="font-medium text-ink">Bank transfer</p>
                    <span className="ml-auto text-xs font-medium text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      No fee
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    Save the ${(previewCardSurcharge / 100).toFixed(2)} fee — pay by ACH (takes a
                    few days to confirm).
                  </p>
                </div>
              </button>
            )}
          </div>
          {isCreatingSession && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 className="w-4 h-4 animate-spin" />
              Starting secure payment…
            </div>
          )}
        </div>
      )}

      {/* Embedded payment — mounted once a method is selected. */}
      {clientSecret && publishableKey && seasonItem && (
        <div className="mt-6 pt-6 border-t border-border">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-ink">Payment Details</h3>
            <div className="flex items-center gap-2 text-sm">
              {paymentMethodCategory === "bank" ? (
                <Landmark className="w-4 h-4 text-primary" />
              ) : (
                <CreditCard className="w-4 h-4 text-ink-2" />
              )}
              <span className="text-ink-muted">
                Paying by {paymentMethodCategory === "bank" ? "bank" : "card or wallet"}
              </span>
              <button
                type="button"
                onClick={onPaymentCancel}
                className="text-primary hover:underline"
              >
                Change
              </button>
            </div>
          </div>
          <EmbeddedPayment
            clientSecret={clientSecret}
            publishableKey={publishableKey}
            seasonItem={seasonItem}
            valueCents={paymentValueCents}
            paymentType={checkoutPaymentType}
            coupon={appliedDiscount?.code}
            returnUrl={paymentReturnUrl}
            paymentMethodCategory={paymentMethodCategory}
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
