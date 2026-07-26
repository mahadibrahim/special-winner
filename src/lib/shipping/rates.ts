import type { Parcel, ShippingRate } from "./types";

export function pickCheapestRate(rates: ShippingRate[]): ShippingRate | null {
  if (rates.length === 0) return null;
  return rates.reduce((a, b) => (b.amountCents < a.amountCents ? b : a));
}

export interface ParcelLine {
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  quantity: number;
  productName: string;
}

export function parcelForLines(
  lines: ParcelLine[],
): { ok: true; parcel: Parcel } | { ok: false; missing: string[] } {
  const missing = lines.filter((l) => l.weightOz == null || l.weightOz <= 0).map((l) => l.productName);
  if (missing.length) return { ok: false, missing };
  const weightOz = lines.reduce((s, l) => s + (l.weightOz as number) * l.quantity, 0);
  const max = (k: "lengthIn" | "widthIn" | "heightIn") => {
    const v = lines.map((l) => l[k]).filter((n): n is number => n != null);
    return v.length ? Math.max(...v) : null;
  };
  return { ok: true, parcel: { weightOz, lengthIn: max("lengthIn"), widthIn: max("widthIn"), heightIn: max("heightIn") } };
}
