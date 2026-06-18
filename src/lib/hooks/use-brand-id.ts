import { useEffect, useState } from "react";
import { brandFromDataAttr, type BrandId } from "@/lib/dashboard/brand";

/**
 * Brand of the current page, read from <html data-brand> (set by BaseLayout).
 * Starts as "aspire" (matches SSR/first client render to avoid a hydration
 * mismatch) and resolves the real brand after mount.
 */
export function useBrandId(): BrandId {
  const [brand, setBrand] = useState<BrandId>("aspire");
  useEffect(() => {
    setBrand(brandFromDataAttr(document.documentElement.getAttribute("data-brand")));
  }, []);
  return brand;
}
