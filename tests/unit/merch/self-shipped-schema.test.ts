import { describe, it, expect } from "vitest";
import { merchVariants } from "@/lib/db/schema/merch";
import { merchOrders } from "@/lib/db/schema/merch-orders";
describe("self-shipped schema (3c)", () => {
  it("variants carry weight + dims", () => {
    for (const c of ["weightOz","lengthIn","widthIn","heightIn"]) expect(Object.keys(merchVariants)).toContain(c);
  });
  it("orders carry carrier + tracking", () => {
    for (const c of ["shippingCarrier","shippingService","trackingNumber","trackingUrl","shippedAt"]) expect(Object.keys(merchOrders)).toContain(c);
  });
});
