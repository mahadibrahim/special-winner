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
  paymentOption: "full" | "deposit"
  registrantName: string
  appliedDiscount: AppliedDiscount | null
}

export function OrderSummary({
  seasonName,
  seasonPrice,
  seasonDeposit,
  allowDeposit,
  paymentOption,
  registrantName,
  appliedDiscount,
}: OrderSummaryProps) {
  const baseAmount =
    paymentOption === "deposit" && allowDeposit && seasonDeposit
      ? seasonDeposit
      : seasonPrice
  const discountAmount = appliedDiscount ? appliedDiscount.discountAmountCents / 100 : 0
  const totalDue = baseAmount - discountAmount

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
        </span>
        <span className="text-ink">${baseAmount}</span>
      </div>
      {appliedDiscount && (
        <div className="flex items-center justify-between mb-2 text-green-400">
          <span>Discount ({appliedDiscount.code})</span>
          <span>-${discountAmount.toFixed(2)}</span>
        </div>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-primary/20">
        <span className="text-ink font-semibold">Total Due Today</span>
        <span className="text-ink font-bold text-xl">${totalDue.toFixed(2)}</span>
      </div>
    </div>
  )
}
