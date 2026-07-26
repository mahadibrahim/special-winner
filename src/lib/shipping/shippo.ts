import type { ShipAddress, Parcel, ShippingRate, ShippingRateProvider } from "./types";
import { ShippingProviderError } from "./types";

const SHIPPO_API_BASE = "https://api.goshippo.com";

// Default box used when a line's own dimensions aren't known — a mid-size
// apparel/small-goods box. Only weight is required per line (parcelForLines
// enforces that); dims are best-effort.
const DEFAULT_LENGTH_IN = 10;
const DEFAULT_WIDTH_IN = 8;
const DEFAULT_HEIGHT_IN = 4;

// process.env only — Netlify SSR inlines import.meta.env at BUILD time, so a
// rotated/runtime-set Shippo key would read as undefined via import.meta.env.
function getApiKey(): string | undefined {
  return process.env.SHIPPO_API_KEY;
}

function toShippoAddress(addr: ShipAddress) {
  return {
    name: addr.name,
    street1: addr.street1,
    street2: addr.street2 ?? undefined,
    city: addr.city,
    state: addr.state,
    zip: addr.zip,
    country: addr.country,
  };
}

interface ShippoRate {
  amount?: string;
  currency?: string;
  provider?: string;
  servicelevel?: { name?: string };
  estimated_days?: number | null;
  object_id?: string;
}

interface ShippoShipmentResponse {
  rates?: ShippoRate[];
  detail?: string;
  error?: string;
}

/**
 * Maps raw Shippo rate objects to ShippingRate, and drops any rate whose
 * amountCents isn't a finite positive number, or whose currency isn't USD.
 * Shippo is the money trust boundary here — a malformed/missing `amount`
 * must never survive as a 0-cost rate, or pickCheapestRate's `<` comparison
 * will always pick it as "free shipping". Likewise a non-USD rate's `amount`
 * must never be treated as USD cents.
 */
export function mapShippoRates(rawRates: unknown[]): ShippingRate[] {
  return (rawRates as ShippoRate[])
    .map((r) => ({
      carrier: r?.provider ?? "unknown",
      service: r?.servicelevel?.name ?? "unknown",
      amountCents: Math.round(parseFloat(r?.amount ?? "") * 100),
      currency: r?.currency ?? "",
      estDays: r?.estimated_days ?? null,
      providerRateId: r?.object_id ?? null,
    }))
    .filter(
      (r) =>
        Number.isFinite(r.amountCents) &&
        r.amountCents > 0 &&
        String(r.currency ?? "").toUpperCase() === "USD",
    );
}

export class ShippoRateProvider implements ShippingRateProvider {
  isConfigured(): boolean {
    return !!getApiKey();
  }

  async getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel): Promise<ShippingRate[]> {
    const key = getApiKey();
    if (!key) {
      throw new ShippingProviderError("SHIPPO_API_KEY is not set");
    }

    const body = {
      address_from: toShippoAddress(from),
      address_to: toShippoAddress(to),
      parcels: [
        {
          weight: String(parcel.weightOz),
          mass_unit: "oz",
          length: String(parcel.lengthIn ?? DEFAULT_LENGTH_IN),
          width: String(parcel.widthIn ?? DEFAULT_WIDTH_IN),
          height: String(parcel.heightIn ?? DEFAULT_HEIGHT_IN),
          distance_unit: "in",
        },
      ],
      async: false,
    };

    let res: Response;
    try {
      res = await fetch(`${SHIPPO_API_BASE}/shipments/`, {
        method: "POST",
        headers: {
          Authorization: `ShippoToken ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new ShippingProviderError(
        `Shippo request failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    const json = (await res.json().catch(() => null)) as ShippoShipmentResponse | null;
    if (!res.ok || !json) {
      const detail = json?.detail ?? json?.error;
      throw new ShippingProviderError(
        `Shippo shipments request failed with status ${res.status}${detail ? `: ${detail}` : ""}`,
      );
    }

    return mapShippoRates(json.rates ?? []);
  }
}
