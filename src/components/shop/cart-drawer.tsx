"use client";
import { useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useCart } from "./cart-store";
import { cartLineKey, cartSubtotalCents, isBundleLine } from "@/lib/merch/cart";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function CartDrawer() {
  useHydrationBeacon();
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const subtotal = cartSubtotalCents(cart.items);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="relative text-ink" aria-label={`Cart (${cart.count})`}>
        Cart{cart.count > 0 && <span className="ml-1 text-xs bg-ink text-cream rounded-full px-2 py-0.5">{cart.count}</span>}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Cart">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="relative bg-cream w-full max-w-sm h-full p-6 overflow-y-auto">
            <button type="button" onClick={() => setOpen(false)} className="mb-4 text-sm text-ink-muted">Close ✕</button>
            {cart.items.length === 0 ? (
              <p className="text-ink-muted">Your cart is empty.</p>
            ) : (
              <>
                <ul className="space-y-4 list-none p-0 m-0">
                  {cart.items.map((i) => {
                    const lineKey = cartLineKey(i);
                    return (
                      <li key={lineKey} className="flex gap-3 items-center">
                        <div className="flex-1">
                          <p className="text-sm text-ink">{i.name}</p>
                          {isBundleLine(i) ? (
                            <p className="text-xs text-ink-muted">
                              {i.selections.map((s) => (s.size ? `${s.label}: ${s.size}` : s.label)).join(", ")}
                            </p>
                          ) : (
                            <>
                              <p className="text-xs text-ink-muted">{[i.color, i.size].filter(Boolean).join(" · ")}</p>
                              {i.personalization && (i.personalization.name || i.personalization.number) && (
                                <p className="text-xs text-ink-muted">
                                  {[i.personalization.name, i.personalization.number].filter(Boolean).join(" #")}
                                </p>
                              )}
                            </>
                          )}
                          <p className="text-xs text-ink-muted">{money(i.unitPriceCents)} × {i.quantity}</p>
                        </div>
                        <input type="number" min={0} value={i.quantity}
                          onChange={(e) => cart.setQty(lineKey, Number(e.target.value))}
                          className="w-14 border border-ink/30 px-2 py-1 text-sm" aria-label={`Quantity for ${i.name}`} />
                        <button type="button" onClick={() => cart.remove(lineKey)} className="text-xs text-ink-muted" aria-label={`Remove ${i.name}`}>✕</button>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-6 border-t border-ink/10 pt-4">
                  <p className="flex justify-between text-sm text-ink"><span>Subtotal</span><span>{money(subtotal)}</span></p>
                  <p className="text-xs text-ink-muted mt-1">Shipping &amp; tax calculated at checkout.</p>
                  <a href="/shop/checkout" className="mt-4 block text-center bg-ink text-cream px-6 py-3 text-sm font-medium uppercase tracking-wide">Checkout</a>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
