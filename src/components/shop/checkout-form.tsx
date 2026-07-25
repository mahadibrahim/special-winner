"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useCart } from "./cart-store";
import { cartSubtotalCents, cartStoreId } from "@/lib/merch/cart";
import { ErrorBanner } from "@/components/ui/error-banner";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

interface QuoteStoreInfo {
  id: string;
  name: string;
  pickupLocation: string | null;
  orderOpensAt: string | null;
  orderClosesAt: string | null;
}

interface QuoteResult {
  subtotalCents: number;
  shippingCents: number;
  totalBeforeTaxCents: number;
  currency: string;
  store?: QuoteStoreInfo | null;
}

export default function CheckoutForm() {
  useHydrationBeacon();
  const cart = useCart();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [address1, setAddress1] = useState("");
  const [address2, setAddress2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");

  const [quote, setQuote] = useState<QuoteResult | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const storeId = cartStoreId(cart.items);
  const pickupOnly = cart.items.length > 0 && cart.items.every((i) => i.fulfillmentType === "pickup");

  const subtotal = cartSubtotalCents(cart.items);

  const isAddressComplete = () =>
    Boolean(
      name.trim() &&
        address1.trim() &&
        city.trim() &&
        state.trim().length === 2 &&
        zip.trim().length >= 3,
    );

  function updateField<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setQuote((prev) => (prev ? null : prev));
    };
  }

  const buildAddress = () => ({
    name: name.trim(),
    address1: address1.trim(),
    address2: address2.trim() || undefined,
    city: city.trim(),
    state: state.trim().toUpperCase(),
    zip: zip.trim(),
    country: "US" as const,
  });

  const buildItems = () =>
    cart.items.map((i) => ({
      variantId: i.variantId,
      quantity: i.quantity,
      personalization: i.personalization ?? null,
    }));

  async function fetchQuote(address: ReturnType<typeof buildAddress> | null) {
    if (!storeId) return;
    setError(null);
    setQuoteLoading(true);
    try {
      const res = await fetch("/api/merch/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          address,
          items: buildItems(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not get a shipping total.");
        setQuote(null);
        return;
      }
      setQuote(json);
    } catch {
      setError("Could not get a shipping total. Check your connection and try again.");
      setQuote(null);
    } finally {
      setQuoteLoading(false);
    }
  }

  // Pickup carts skip the address form entirely, so fetch the (no-shipping)
  // quote + pickup details as soon as we know the cart is pickup-only.
  useEffect(() => {
    if (pickupOnly && storeId) void fetchQuote(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupOnly, storeId, cart.items]);

  function handleZipBlur() {
    if (!pickupOnly && isAddressComplete()) void fetchQuote(buildAddress());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!storeId) {
      setError("Your cart is empty.");
      return;
    }
    if (!pickupOnly && !isAddressComplete()) {
      setError("Enter a complete shipping address to check out.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/merch/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          email: email.trim(),
          address: pickupOnly ? null : buildAddress(),
          items: buildItems(),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(json.error ?? "We couldn't start checkout. Please try again.");
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("We couldn't start checkout. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (cart.items.length === 0) {
    return (
      <div className="text-sm text-ink-muted">
        <p className="mb-4">Your cart is empty.</p>
        <a href="/shop" className="text-ink underline">
          Back to shop
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <ErrorBanner message={error} />

      <section>
        <h2 className="font-display text-lg text-ink mb-4">Order summary</h2>
        <ul className="list-none p-0 m-0 divide-y divide-ink/10">
          {cart.items.map((i) => {
            const lineKey = i.lineId ?? i.variantId;
            return (
              <li key={lineKey} className="py-3 flex justify-between text-sm text-ink">
                <span>
                  {i.name} {[i.color, i.size].filter(Boolean).join(" · ")}
                  {i.personalization && (i.personalization.name || i.personalization.number) && (
                    <> ({[i.personalization.name, i.personalization.number].filter(Boolean).join(" #")})</>
                  )}{" "}
                  × {i.quantity}
                </span>
                <span>{money(i.unitPriceCents * i.quantity)}</span>
              </li>
            );
          })}
        </ul>
        <p className="flex justify-between text-sm font-medium text-ink mt-3">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg text-ink">Contact</h2>
        <div>
          <label htmlFor="email" className="block text-sm text-ink mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => updateField(setEmail)(e.target.value)}
            className="w-full border border-ink/30 px-3 py-2 text-sm"
          />
        </div>
      </section>

      {pickupOnly ? (
        <section className="space-y-2">
          <h2 className="font-display text-lg text-ink">Pickup</h2>
          <p className="text-sm text-ink">This order is for pickup — no shipping required.</p>
          {quote?.store?.pickupLocation && (
            <p className="text-sm text-ink-muted">Pickup location: {quote.store.pickupLocation}</p>
          )}
          {quote?.store?.orderClosesAt && (
            <p className="text-sm text-ink-muted">
              Orders close {new Date(quote.store.orderClosesAt).toLocaleDateString()}.
            </p>
          )}
        </section>
      ) : (
        <section className="space-y-4">
          <h2 className="font-display text-lg text-ink">Shipping address</h2>

          <div>
            <label htmlFor="name" className="block text-sm text-ink mb-1">
              Full name
            </label>
            <input
              id="name"
              type="text"
              required
              value={name}
              onChange={(e) => updateField(setName)(e.target.value)}
              className="w-full border border-ink/30 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="address1" className="block text-sm text-ink mb-1">
              Address
            </label>
            <input
              id="address1"
              type="text"
              required
              value={address1}
              onChange={(e) => updateField(setAddress1)(e.target.value)}
              className="w-full border border-ink/30 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label htmlFor="address2" className="block text-sm text-ink mb-1">
              Apt, suite, etc. (optional)
            </label>
            <input
              id="address2"
              type="text"
              value={address2}
              onChange={(e) => updateField(setAddress2)(e.target.value)}
              className="w-full border border-ink/30 px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="city" className="block text-sm text-ink mb-1">
                City
              </label>
              <input
                id="city"
                type="text"
                required
                value={city}
                onChange={(e) => updateField(setCity)(e.target.value)}
                className="w-full border border-ink/30 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="state" className="block text-sm text-ink mb-1">
                State
              </label>
              <input
                id="state"
                type="text"
                required
                maxLength={2}
                value={state}
                onChange={(e) => updateField(setState)(e.target.value.toUpperCase())}
                className="w-full border border-ink/30 px-3 py-2 text-sm uppercase"
                placeholder="OH"
              />
            </div>
          </div>

          <div>
            <label htmlFor="zip" className="block text-sm text-ink mb-1">
              ZIP code
            </label>
            <input
              id="zip"
              type="text"
              required
              value={zip}
              onChange={(e) => updateField(setZip)(e.target.value)}
              onBlur={handleZipBlur}
              className="w-full border border-ink/30 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => void fetchQuote(buildAddress())}
            disabled={quoteLoading}
            className="text-sm text-ink underline disabled:opacity-50"
          >
            {quoteLoading ? "Getting shipping total…" : "Get shipping total"}
          </button>
        </section>
      )}

      {quote && (
        <div className="border-t border-ink/10 pt-4 text-sm text-ink space-y-1">
          <p className="flex justify-between">
            <span>Subtotal</span>
            <span>{money(quote.subtotalCents)}</span>
          </p>
          <p className="flex justify-between">
            <span>Shipping</span>
            <span>{money(quote.shippingCents)}</span>
          </p>
          <p className="flex justify-between font-medium">
            <span>Total</span>
            <span>{money(quote.totalBeforeTaxCents)}</span>
          </p>
          <p className="text-xs text-ink-muted">Tax calculated at payment.</p>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-ink text-cream px-6 py-3 text-sm font-medium uppercase tracking-wide disabled:opacity-50"
      >
        {loading ? "Processing…" : "Pay"}
      </button>
    </form>
  );
}
