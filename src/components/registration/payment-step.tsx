"use client"

import { Tag, CheckCircle2, AlertCircle, Loader2, X, Landmark, CreditCard } from "lucide-react"
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

  // Compute a preview surcharge for each method group so the picker can show
  // exactly what each option costs before the customer commits.
  const baseAmountCents =
    paymentOption === "deposit" && allowDeposit && seasonDepositCents
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
  const previewBankTotal = amountAfterCreditCents
  const previewCardTotal = amountAfterCreditCents + previewCardSurcharge

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
      <div>
        <h3 className="text-lg font-semibold text-ink mb-2">Payment Option</h3>
        <p className="text-ink-muted text-sm">
          Choose how you'd like to pay for this registration.
        </p>
      </div>

      <RadioGroup
        value={paymentOption}
        onValueChange={(v) => onPaymentOptionChange(v as "full" | "deposit")}
        disabled={optionLocked}
      >
        <div className="space-y-3">
          <Label
            htmlFor="pay-full"
            className={`flex items-center p-4 rounded-xl border transition-all ${
              optionLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
            } ${
              paymentOption === "full"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-ink-faint bg-paper"
            }`}
          >
            <RadioGroupItem value="full" id="pay-full" className="mr-4" disabled={optionLocked} />
            <div className="flex-1">
              <p className="font-medium text-ink">Pay in Full</p>
              <p className="text-sm text-ink-muted">Complete payment now</p>
            </div>
            <div className="text-right">
              {earlyBirdActive && (
                <p className="text-xs font-medium text-primary">Early-bird</p>
              )}
              <div className="text-xl font-bold text-ink">${seasonPrice}</div>
            </div>
          </Label>

          {allowDeposit && seasonDeposit && (
            <Label
              htmlFor="pay-deposit"
              className={`flex items-center p-4 rounded-xl border transition-all ${
                optionLocked ? "cursor-not-allowed opacity-70" : "cursor-pointer"
              } ${
                paymentOption === "deposit"
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

      {/* Order Summary */}
      <OrderSummary
        seasonName={seasonName}
        seasonPrice={seasonPrice}
        seasonDeposit={seasonDeposit}
        allowDeposit={allowDeposit}
        earlyBirdActive={earlyBirdActive}
        paymentOption={paymentOption}
        registrantName={registrantName}
        appliedDiscount={appliedDiscount}
        surchargeCents={displaySurchargeCents}
        paymentMethodCategory={paymentMethodCategory}
        creditAppliedCents={displayCreditAppliedCents}
      />

      {/* Payment method — selecting one creates the session and reveals the
          inline payment form. No separate "continue to payment" step. */}
      {!sessionLocked && (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-ink mb-1">Payment Method</h3>
            <p className="text-ink-muted text-sm">
              {ACH_ENABLED
                ? "Pick a method to enter your payment details. Bank transfer is free; card payments include the processor fee."
                : "Pay securely by card or wallet — Visa, Mastercard, Apple Pay, or Google Pay."}
            </p>
          </div>
          <div className={`grid gap-3 ${ACH_ENABLED ? "sm:grid-cols-2" : ""}`}>
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
                    Pay ${(previewBankTotal / 100).toFixed(2)} from your checking account (ACH).
                  </p>
                </div>
              </button>
            )}
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
                  Pay ${(previewCardTotal / 100).toFixed(2)} by Visa, Mastercard, Apple Pay, or
                  Google Pay.
                </p>
              </div>
            </button>
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
        </div>
      )}
    </div>
  )
}
