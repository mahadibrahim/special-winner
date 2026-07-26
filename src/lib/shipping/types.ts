export interface ShipAddress {
  name?: string;
  street1: string;
  street2?: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface Parcel {
  weightOz: number;
  lengthIn?: number | null;
  widthIn?: number | null;
  heightIn?: number | null;
}

export interface ShippingRate {
  carrier: string;
  service: string;
  amountCents: number;
  estDays?: number | null;
  providerRateId?: string | null;
}

export interface ShippingRateProvider {
  isConfigured(): boolean;
  getRates(from: ShipAddress, to: ShipAddress, parcel: Parcel): Promise<ShippingRate[]>;
}

export class ShippingProviderError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ShippingProviderError";
  }
}
