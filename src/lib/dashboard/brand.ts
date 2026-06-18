export type BrandId = "aspire" | "soccerone";

/** Resolve the brand from an <html data-brand> attribute value. */
export function brandFromDataAttr(value: string | null): BrandId {
  return value === "soccerone" ? "soccerone" : "aspire";
}
