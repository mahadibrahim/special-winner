import { describe, it, expect } from "vitest";
import { walletNamesFromCanMakePayment } from "@/lib/payments/express-wallets";

describe("walletNamesFromCanMakePayment", () => {
  it("returns [] for null (no wallet support at all)", () => {
    expect(walletNamesFromCanMakePayment(null)).toEqual([]);
  });
  it("returns [] when both flags are false", () => {
    expect(walletNamesFromCanMakePayment({ applePay: false, googlePay: false })).toEqual([]);
  });
  it("maps applePay to apple_pay", () => {
    expect(walletNamesFromCanMakePayment({ applePay: true, googlePay: false })).toEqual(["apple_pay"]);
  });
  it("maps both wallets in stable order", () => {
    expect(walletNamesFromCanMakePayment({ applePay: true, googlePay: true })).toEqual([
      "apple_pay",
      "google_pay",
    ]);
  });
  it("tolerates undefined", () => {
    expect(walletNamesFromCanMakePayment(undefined)).toEqual([]);
  });
});
