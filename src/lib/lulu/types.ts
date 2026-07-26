export const LULU_SHIPPING_LEVELS = ["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"] as const;
export type LuluShippingLevel = (typeof LULU_SHIPPING_LEVELS)[number];

export const LULU_LEVEL_LABELS: Record<LuluShippingLevel, string> = {
  MAIL: "Mail",
  PRIORITY_MAIL: "Priority Mail",
  GROUND: "Ground",
  EXPEDITED: "Expedited",
  EXPRESS: "Express",
};

export interface LuluCostLineItem {
  podPackageId: string;
  pageCount: number;
  quantity: number;
}

export interface LuluAddressInput {
  name: string;
  street1: string;
  street2?: string | null;
  city: string;
  stateCode: string;
  postcode: string;
  countryCode: string;
  phoneNumber?: string | null;
}

export interface LuluPrintJobLineItemInput extends LuluCostLineItem {
  title: string;
  interiorUrl: string;
  coverUrl: string;
}

export interface LuluTracking {
  trackingId: string | null;
  trackingUrl: string | null;
  carrier: string | null;
}
