"use client";
import { useEffect, useState, useCallback } from "react";
import { type CartLine, addLineToCart, cartLineCount, cartLineKey } from "@/lib/merch/cart";

const KEY = "aspire_merch_cart_v1";

function read(): CartLine[] {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function useCart() {
  const [items, setItems] = useState<CartLine[]>([]);
  useEffect(() => { setItems(read()); }, []);
  const persist = useCallback((next: CartLine[]) => {
    setItems(next);
    localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("merch-cart-changed"));
  }, []);
  // keep multiple islands in sync
  useEffect(() => {
    const onChange = () => setItems(read());
    window.addEventListener("merch-cart-changed", onChange);
    return () => window.removeEventListener("merch-cart-changed", onChange);
  }, []);

  return {
    items,
    count: cartLineCount(items),
    add: (line: CartLine) => persist(addLineToCart(read(), line)),
    // `key` identifies a single cart line: `lineId` for personalized/bundle
    // lines (which can repeat a variantId/bundleId across distinct
    // selections), else `variantId`. See cart-drawer.tsx for the matching
    // key it passes in (via `cartLineKey`).
    setQty: (key: string, qty: number) =>
      persist(read().map((i) => (cartLineKey(i) === key ? { ...i, quantity: qty } : i)).filter((i) => i.quantity > 0)),
    remove: (key: string) => persist(read().filter((i) => cartLineKey(i) !== key)),
    clear: () => persist([]),
  };
}
