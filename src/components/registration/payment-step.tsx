"use client"

import { Tag, CheckCircle2, AlertCircle, Loader2, X, Landmark, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { OrderSummary } from "./order-summary"
import { EmbeddedPayment } from "./embedded-payment"
import { computeSurchargeCents } from "@/lib/payments/surcharge"
import type { SeasonItem, CheckoutPaymentType } from "@/lib/analytics/datalayer"

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
  paymentOption: "full" | "deposit"
  registrantName: string

  // Payment-method category (the bank-vs-card choice that drives surcharge).
  paymentMethodCategory: "bank" | "card"
  onPaymentMethodCategoryChange: (v: "bank" | "card") => void
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

  // Embedded-payment props — when clientSecret is set, renders the
  // payment form below the order summary. When null, only the order
  // configuration UI shows (4a state).
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
  paymentOption,
  paymentMethodCategory,
  onPaymentMethodCategoryChange,
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
  clientSecret,
  publishableKey,
  seasonItem,
  paymentValueCents,
  checkoutPaymentType,
  paymentReturnUrl,
  onPaymentSuccess,
  onPaymentCancel,
}: PaymentStepProps) {
  // Once we have a clientSecret, the customer has committed to a category
  // and we hide the picker (changing would require recreating the session).
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
  const previewCardSurcharge = computeSurchargeCents(discountedBaseCents, "card")
  const previewBankTotal = discountedBaseCents
  const previewCardTotal = discountedBaseCents + previewCardSurcharge

  // Display surcharge: post-commit, use the server-confirmed value so we can't
  // get out of sync with what Stripe actually charged.
  const displaySurchargeCents = sessionLocked
    ? appliedSurchargeCents
    : paymentMethodCategory === "card"
      ? previewCardSurcharge
      : 0

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ink mb-2">Payment Option</h3>
        <p className="text-ink-muted text-sm">
          Choose how you'd like to pay for this registration.
        </p>
      </div>

      <RadioGroup value={paymentOption} onValueChange={(v) => onPaymentOptionChange(v as "full" | "deposit")}>
        <div className="space-y-3">
          <Label
            htmlFor="pay-full"
            className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
              paymentOption === "full"
                ? "border-primary bg-primary/10"
                : "border-border hover:border-ink-faint bg-paper"
            }`}
          >
            <RadioGroupItem value="full" id="pay-full" className="mr-4" />
            <div className="flex-1">
              <p className="font-medium text-ink">Pay in Full</p>
              <p className="text-sm text-ink-muted">Complete payment now</p>
            </div>
            <div className="text-xl font-bold text-ink">${seasonPrice}</div>
          </Label>

          {allowDeposit && seasonDeposit && (
            <Label
              htmlFor="pay-deposit"
              className={`flex items-center p-4 rounded-xl border cursor-pointer transition-all ${
                paymentOption === "deposit"
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

      {/* Payment-method category — bank vs card. Surcharge applies to card. */}
      {!sessionLocked && (
        <div className="space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-ink mb-1">Payment Method</h3>
            <p className="text-ink-muted text-sm">
              Bank transfer is free. Card payments include the processor fee.
            </p>
          </div>
          <RadioGroup
            value={paymentMethodCategory}
            onValueChange={(v) => onPaymentMethodCategoryChange(v as "bank" | "card")}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <Label
                htmlFor="method-bank"
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  paymentMethodCategory === "bank"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-ink-faint bg-paper"
                }`}
              >
                <RadioGroupItem value="bank" id="method-bank" className="mt-1" />
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
              </Label>
              <Label
                htmlFor="method-card"
                className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition-all ${
                  paymentMethodCategory === "card"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-ink-faint bg-paper"
                }`}
              >
                <RadioGroupItem value="card" id="method-card" className="mt-1" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CreditCard className="w-4 h-4 text-ink-2" />
                    <p className="font-medium text-ink">Card or wallet</p>
                    <span className="ml-auto text-xs font-medium text-ink-2 bg-ink/5 px-2 py-0.5 rounded-full">
                      +${(previewCardSurcharge / 100).toFixed(2)} fee
                    </span>
                  </div>
                  <p className="text-sm text-ink-muted">
                    Pay ${(previewCardTotal / 100).toFixed(2)} by Visa, Mastercard, Apple Pay, Klarna,
                    Affirm, Cash App, or Amazon Pay.
                  </p>
                </div>
              </Label>
            </div>
          </RadioGroup>
        </div>
      )}

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

      {/* Order Summary */}
      <OrderSummary
        seasonName={seasonName}
        seasonPrice={seasonPrice}
        seasonDeposit={seasonDeposit}
        allowDeposit={allowDeposit}
        paymentOption={paymentOption}
        registrantName={registrantName}
        appliedDiscount={appliedDiscount}
        surchargeCents={displaySurchargeCents}
        paymentMethodCategory={paymentMethodCategory}
      />

      {/* Step 4b: Embedded payment (rendered once Continue-to-Payment fires) */}
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
