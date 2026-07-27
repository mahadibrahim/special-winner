/**
 * Maps Stripe's canMakePayment() result to the snake_case wallet names we
 * report as express_wallets_available on payment_step_wallets_resolved.
 * Pure — the Stripe probe itself lives in embedded-payment.tsx.
 */
export function walletNamesFromCanMakePayment(
  result: { applePay?: boolean; googlePay?: boolean } | null | undefined,
): string[] {
  if (!result) return [];
  const names: string[] = [];
  if (result.applePay) names.push("apple_pay");
  if (result.googlePay) names.push("google_pay");
  return names;
}
