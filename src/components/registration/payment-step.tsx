"use client"

import { Tag, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { OrderSummary } from "./order-summary"

interface AppliedDiscount {
  code: string
  discountType: "percentage" | "fixed_amount"
  discountValue: number
  discountAmountCents: number
}

export interface PaymentStepProps {
  seasonName: string
  seasonPrice: number
  seasonDeposit: number | null
  allowDeposit: boolean
  paymentOption: "full" | "deposit"
  registrantName: string

  // Discount state
  discountCodeInput: string
  isValidatingDiscount: boolean
  discountError: string | null
  appliedDiscount: AppliedDiscount | null

  onPaymentOptionChange: (v: "full" | "deposit") => void
  onDiscountCodeInputChange: (v: string) => void
  onApplyDiscount: () => void
  onRemoveDiscount: () => void
}

export function PaymentStep({
  seasonName,
  seasonPrice,
  seasonDeposit,
  allowDeposit,
  paymentOption,
  registrantName,
  discountCodeInput,
  isValidatingDiscount,
  discountError,
  appliedDiscount,
  onPaymentOptionChange,
  onDiscountCodeInputChange,
  onApplyDiscount,
  onRemoveDiscount,
}: PaymentStepProps) {
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
      />
    </div>
  )
}
