"use client";
import { useEffect, useState, useCallback } from "react";
import { type CartItem, mergeCartItem } from "@/lib/merch/cart";

const KEY = "aspire_merch_cart_v1";

function read(): CartItem[] {
  if (typeof localStorage === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) ?? "[]"); } catch { return []; }
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);
  useEffect(() => { setItems(read()); }, []);
  const persist = useCallback((next: CartItem[]) => {
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
    count: items.reduce((n, i) => n + i.quantity, 0),
    add: (item: CartItem) => {
      const current = read();
      // Carts are single-store: adding an item from a different store than
      // the current cart replaces it rather than mixing stores.
      const sameStore = current.length === 0 || current[0].storeId === item.storeId;
      persist(sameStore ? mergeCartItem(current, item) : [item]);
    },
    // `key` identifies a single cart line: `lineId` for personalized lines
    // (which can repeat a variantId across distinct personalizations), else
    // `variantId`. See cart-drawer.tsx for the matching key it passes in.
    setQty: (key: string, qty: number) =>
      persist(read().map((i) => ((i.lineId ?? i.variantId) === key ? { ...i, quantity: qty } : i)).filter((i) => i.quantity > 0)),
    remove: (key: string) => persist(read().filter((i) => (i.lineId ?? i.variantId) !== key)),
    clear: () => persist([]),
  };
}
