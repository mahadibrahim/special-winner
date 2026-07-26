import { ShippoRateProvider } from "./shippo";
import type { ShippingRateProvider } from "./types";

export * from "./types";
export * from "./rates";

let provider: ShippingRateProvider | null = null;
export function getShippingProvider(): ShippingRateProvider {
  return (provider ??= new ShippoRateProvider());
}
