"use client"

interface AppliedDiscount {
  code: string
  discountType: "percentage" | "fixed_amount"
  discountValue: number
  discountAmountCents: number
}

interface OrderSummaryProps {
  seasonName: string
  seasonPrice: number
  seasonDeposit: number | null
  allowDeposit: boolean
  /** True while the season's early-bird window is live — seasonPrice already carries the discounted price. */
  earlyBirdActive?: boolean
  paymentOption: "full" | "deposit"
  registrantName: string
  appliedDiscount: AppliedDiscount | null
  /** Card processing fee in cents — 0 for bank, computed by the parent for card. */
  surchargeCents?: number
  paymentMethodCategory?: "bank" | "card"
  /** Account credit being applied to this checkout, in cents. 0/undefined
   *  renders nothing — matches the surcharge row's "only show if > 0" pattern. */
  creditAppliedCents?: number
  /** Automatic member camp discount (server-resolved, from the registered
   *  child's active membership tier). 0/undefined renders nothing — same
   *  "only show if > 0" pattern as the other conditional rows. Distinct
   *  from `appliedDiscount`: a typed code and the member discount never
   *  stack, so at most one of the two rows renders. */
  memberDiscountCents?: number
  memberDiscountPct?: number
}

export function OrderSummary({
  seasonName,
  seasonPrice,
  seasonDeposit,
  allowDeposit,
  earlyBirdActive = false,
  paymentOption,
  registrantName,
  appliedDiscount,
  surchargeCents = 0,
  paymentMethodCategory,
  creditAppliedCents = 0,
  memberDiscountCents = 0,
  memberDiscountPct = 0,
}: OrderSummaryProps) {
  const baseAmount =
    paymentOption === "deposit" && allowDeposit && seasonDeposit
      ? seasonDeposit
      : seasonPrice
  const discountAmount = appliedDiscount ? appliedDiscount.discountAmountCents / 100 : 0
  const memberDiscountAmount = memberDiscountCents / 100
  const creditAmount = creditAppliedCents / 100
  const surchargeAmount = surchargeCents / 100
  const totalDue =
    Math.max(0, baseAmount - discountAmount - memberDiscountAmount - creditAmount) +
    surchargeAmount

  return (
    <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
      <div className="flex items-center justify-between mb-2">
        <span className="text-ink-2">Registration for</span>
        <span className="text-ink font-medium">{registrantName}</span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-ink-2">Program</span>
        <span className="text-ink font-medium">{seasonName}</span>
      </div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-ink-2">
          {paymentOption === "deposit" ? "Deposit" : "Subtotal"}
          {paymentOption !== "deposit" && earlyBirdActive && (
            <span className="ml-2 text-xs font-medium text-primary">Early-bird</span>
          )}
        </span>
        <span className="text-ink">${baseAmount.toFixed(2)}</span>
      </div>
      {appliedDiscount && (
        <div className="flex items-center justify-between mb-2 text-green-400">
          <span>Discount ({appliedDiscount.code})</span>
          <span>-${discountAmount.toFixed(2)}</span>
        </div>
      )}
      {memberDiscountCents > 0 && (
        <div className="flex items-center justify-between mb-2 text-green-400">
          <span>Member discount ({memberDiscountPct}%)</span>
          <span>-${memberDiscountAmount.toFixed(2)}</span>
        </div>
      )}
      {creditAppliedCents > 0 && (
        <div className="flex items-center justify-between mb-2 text-green-400">
          <span>Account credit applied</span>
          <span>-${creditAmount.toFixed(2)}</span>
        </div>
      )}
      {surchargeCents > 0 && (
        <div className="flex items-center justify-between mb-2 text-ink-2">
          <span>Card processing fee</span>
          <span>+${surchargeAmount.toFixed(2)}</span>
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-primary/20">
        <span className="text-ink font-semibold">Total Due Today</span>
        <span className="text-ink font-bold text-xl">${totalDue.toFixed(2)}</span>
      </div>
      {paymentMethodCategory === "card" && surchargeCents > 0 && (
        <p className="text-xs text-ink-muted mt-2">
          Switch to bank transfer above to skip the ${surchargeAmount.toFixed(2)} fee.
        </p>
      )}
    </div>
  )
}
