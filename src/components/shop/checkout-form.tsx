"use client";

import { useState, type FormEvent } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useCart } from "./cart-store";
import { cartSubtotalCents } from "@/lib/merch/cart";
import { ErrorBanner } from "@/components/ui/error-banner";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

interface QuoteResult {
  subtotalCents: number;
  shippingCents: number;
  totalBeforeTaxCents: number;
  currency: string;
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

  const subtotal = cartSubtotalCents(cart.items);

  const isAddressComplete = () =>
    Boolean(
      name.trim() &&
        address1.trim() &&
        city.trim() &&
        state.trim().length === 2 &&
        zip.trim(),
    );

  const buildAddress = () => ({
    name: name.trim(),
    address1: address1.trim(),
    address2: address2.trim() || undefined,
    city: city.trim(),
    state: state.trim().toUpperCase(),
    zip: zip.trim(),
    country: "US" as const,
  });

  async function fetchQuote() {
    if (!isAddressComplete()) {
      setError("Enter a complete shipping address to get a shipping total.");
      return;
    }
    setError(null);
    setQuoteLoading(true);
    try {
      const res = await fetch("/api/merch/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: buildAddress(),
          items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
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
    } finally {
      setQuoteLoading(false);
    }
  }

  function handleZipBlur() {
    if (isAddressComplete()) void fetchQuote();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/merch/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          address: buildAddress(),
          items: cart.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
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

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <ErrorBanner message={error} />

      <section>
        <h2 className="font-display text-lg text-ink mb-4">Order summary</h2>
        <ul className="list-none p-0 m-0 divide-y divide-ink/10">
          {cart.items.map((i) => (
            <li key={i.variantId} className="py-3 flex justify-between text-sm text-ink">
              <span>
                {i.name} {[i.color, i.size].filter(Boolean).join(" · ")} × {i.quantity}
              </span>
              <span>{money(i.unitPriceCents * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <p className="flex justify-between text-sm font-medium text-ink mt-3">
          <span>Subtotal</span>
          <span>{money(subtotal)}</span>
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-lg text-ink">Contact &amp; shipping address</h2>

        <div>
          <label htmlFor="email" className="block text-sm text-ink mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-ink/30 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="name" className="block text-sm text-ink mb-1">
            Full name
          </label>
          <input
            id="name"
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
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
            onChange={(e) => setAddress1(e.target.value)}
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
            onChange={(e) => setAddress2(e.target.value)}
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
              onChange={(e) => setCity(e.target.value)}
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
              onChange={(e) => setState(e.target.value.toUpperCase())}
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
            onChange={(e) => setZip(e.target.value)}
            onBlur={handleZipBlur}
            className="w-full border border-ink/30 px-3 py-2 text-sm"
          />
        </div>

        <button
          type="button"
          onClick={() => void fetchQuote()}
          disabled={quoteLoading}
          className="text-sm text-ink underline disabled:opacity-50"
        >
          {quoteLoading ? "Getting shipping total…" : "Get shipping total"}
        </button>

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
      </section>

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
