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
    add: (item: CartItem) => persist(mergeCartItem(read(), item)),
    setQty: (variantId: string, qty: number) =>
      persist(read().map((i) => (i.variantId === variantId ? { ...i, quantity: qty } : i)).filter((i) => i.quantity > 0)),
    remove: (variantId: string) => persist(read().filter((i) => i.variantId !== variantId)),
    clear: () => persist([]),
  };
}
