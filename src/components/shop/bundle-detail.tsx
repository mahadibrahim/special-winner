"use client";

import { useMemo, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useCart } from "./cart-store";
import { bundleDiscountedCents, bundleFullCents } from "@/lib/merch/bundle-pricing";
import type { CartBundleItem, CartFulfillmentType, CartBundleSelection } from "@/lib/merch/cart";
import type { MerchBundle } from "@/lib/db/schema";

export interface BundleDetailVariant {
  id: string;
  productId: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
}

export interface BundleDetailSlot {
  slotId: string;
  label: string;
  quantity: number;
  variants: BundleDetailVariant[];
}

export interface BundleDetailProps {
  name: string;
  description: string | null;
  images: { url: string; alt?: string }[];
  slots: BundleDetailSlot[];
  discountType: MerchBundle["discountType"];
  discountValue: number;
  bundleId: string;
  bundleSlug: string;
  storeId: string;
  storeSlug: string;
  /** Whether the store is currently open for ordering; disables add-to-cart when false. */
  shoppable: boolean;
  fulfillmentType: CartFulfillmentType;
  /** Unlisted store's share token, appended to links generated from this page. */
  shareToken: string | null;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function BundleDetail({
  name,
  description,
  images,
  slots,
  discountType,
  discountValue,
  bundleId,
  bundleSlug,
  storeId,
  storeSlug,
  shoppable,
  fulfillmentType,
}: BundleDetailProps) {
  useHydrationBeacon();

  const cart = useCart();
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [selections, setSelections] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const slot of slots) {
      if (slot.variants[0]) initial[slot.slotId] = slot.variants[0].id;
    }
    return initial;
  });

  const chosen = useMemo(
    () =>
      slots.map((slot) => ({
        slot,
        variant: slot.variants.find((v) => v.id === selections[slot.slotId]) ?? null,
      })),
    [slots, selections],
  );

  const allSelected = chosen.every((c) => c.variant !== null);

  const fullCents = useMemo(
    () =>
      bundleFullCents(
        chosen
          .filter((c) => c.variant)
          .map((c) => ({ unitPriceCents: c.variant!.retailPriceCents, quantity: c.slot.quantity })),
      ),
    [chosen],
  );
  const discountedCents = useMemo(
    () => bundleDiscountedCents(fullCents, discountType, discountValue),
    [fullCents, discountType, discountValue],
  );
  const savingsCents = Math.max(0, fullCents - discountedCents);

  return (
    <div className="grid md:grid-cols-2 gap-10">
      <div>
        <div className="aspect-square bg-cream-dark overflow-hidden mb-3">
          {images[activeImage] ? (
            <img
              src={images[activeImage].url}
              alt={images[activeImage].alt ?? name}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full grid place-items-center text-ink-muted text-sm">
              No image
            </div>
          )}
        </div>
        {images.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((img, i) => (
              <button
                key={`${img.url}-${i}`}
                type="button"
                onClick={() => setActiveImage(i)}
                aria-pressed={i === activeImage}
                className={`w-16 h-16 overflow-hidden border ${
                  i === activeImage ? "border-ink" : "border-transparent"
                }`}
              >
                <img
                  src={img.url}
                  alt={img.alt ?? `${name} view ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <span className="inline-block text-xs font-medium uppercase tracking-wide text-ink-muted mb-2">
          Bundle
        </span>
        <h1 className="font-display text-3xl text-ink mb-2">{name}</h1>

        {allSelected ? (
          <div className="mb-6">
            <p className="text-lg text-ink">
              {money(discountedCents)}
              {savingsCents > 0 && (
                <span className="ml-2 text-sm text-ink-muted line-through">{money(fullCents)}</span>
              )}
            </p>
            {savingsCents > 0 && (
              <p className="text-sm text-ink-muted">You save {money(savingsCents)}</p>
            )}
          </div>
        ) : (
          <p className="text-lg text-ink-muted mb-6">Choose options below to see your price</p>
        )}

        {description && (
          <div className="prose prose-sm text-ink-muted whitespace-pre-line mb-6">
            {description}
          </div>
        )}

        <div className="space-y-6">
          {slots.map((slot) => (
            <fieldset key={slot.slotId} className="border-0 p-0 m-0">
              <legend className="text-sm font-medium text-ink mb-2">
                {slot.label}
                {slot.quantity > 1 && <span className="text-ink-muted"> × {slot.quantity}</span>}
              </legend>
              <select
                value={selections[slot.slotId] ?? ""}
                onChange={(e) =>
                  setSelections((prev) => ({ ...prev, [slot.slotId]: e.target.value }))
                }
                aria-label={`Choose option for ${slot.label}`}
                className="border border-ink/30 px-3 py-2 text-sm w-full max-w-xs bg-cream"
              >
                {slot.variants.length === 0 && <option value="">Unavailable</option>}
                {slot.variants.map((v) => {
                  const optionLabel = [v.color, v.size].filter(Boolean).join(" · ") || "Default";
                  return (
                    <option key={v.id} value={v.id}>
                      {optionLabel} — {money(v.retailPriceCents)}
                    </option>
                  );
                })}
              </select>
            </fieldset>
          ))}
        </div>

        {!shoppable && (
          <p className="text-sm text-ink-muted mt-6">Not available for ordering right now.</p>
        )}

        <button
          type="button"
          disabled={!allSelected || !shoppable}
          onClick={() => {
            if (!allSelected || !shoppable) return;
            const bundleSelections: CartBundleSelection[] = chosen.map(({ slot, variant }) => ({
              slotId: slot.slotId,
              productId: variant!.productId,
              variantId: variant!.id,
              label: slot.label,
              size: variant!.size,
            }));
            const line: CartBundleItem = {
              kind: "bundle",
              lineId: crypto.randomUUID(),
              bundleId,
              bundleSlug,
              storeId,
              storeSlug,
              fulfillmentType,
              name,
              imageUrl: images[0]?.url ?? null,
              unitPriceCents: discountedCents,
              selections: bundleSelections,
              quantity: 1,
            };
            cart.add(line);
            setAdded(true);
            setTimeout(() => setAdded(false), 1500);
          }}
          className="mt-8 bg-ink text-cream px-6 py-3 text-sm font-medium uppercase tracking-wide disabled:opacity-50"
        >
          {added ? "Added ✓" : "Add bundle to cart"}
        </button>
      </div>
    </div>
  );
}
