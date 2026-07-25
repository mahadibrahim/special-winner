"use client";

import { useMemo, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useCart } from "./cart-store";
import type { CartFulfillmentType } from "@/lib/merch/cart";
import type { ProductPersonalization } from "@/lib/db/schema";

export interface ProductDetailVariant {
  id: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
  printfulSyncVariantId: string | null;
}

export interface ProductDetailProps {
  name: string;
  description: string | null;
  images: { url: string; alt?: string }[];
  variants: ProductDetailVariant[];
  slug: string;
  storeId: string;
  storeSlug: string;
  /** Whether the store is currently open for ordering; disables add-to-cart when false. */
  shoppable: boolean;
  fulfillmentType: CartFulfillmentType;
  personalization: ProductPersonalization | null;
  /** Unlisted store's share token, appended to links generated from this page. */
  shareToken: string | null;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function ProductDetail({
  name,
  description,
  images,
  variants,
  slug,
  storeId,
  storeSlug,
  shoppable,
  fulfillmentType,
  personalization,
  shareToken,
}: ProductDetailProps) {
  useHydrationBeacon();

  const cart = useCart();
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(
    variants[0]?.id ?? null,
  );
  const [personalName, setPersonalName] = useState("");
  const [personalNumber, setPersonalNumber] = useState("");

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? null,
    [variants, selectedId],
  );

  const wantsPersonalization = Boolean(personalization?.name || personalization?.number);

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
        <h1 className="font-display text-3xl text-ink mb-2">{name}</h1>
        {selected && (
          <p className="text-lg text-ink mb-6">{money(selected.retailPriceCents)}</p>
        )}

        {variants.length > 0 && (
          <fieldset className="mb-6 border-0 p-0 m-0">
            <legend className="text-sm font-medium text-ink mb-2">Options</legend>
            <div className="flex gap-2 flex-wrap">
              {variants.map((v) => {
                const label = [v.color, v.size].filter(Boolean).join(" · ") || "Default";
                const isSel = v.id === selectedId;
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedId(v.id)}
                    aria-pressed={isSel}
                    className={`px-3 py-2 text-sm border ${
                      isSel ? "border-ink bg-ink text-cream" : "border-ink/30 text-ink"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {description && (
          <div className="prose prose-sm text-ink-muted whitespace-pre-line">
            {description}
          </div>
        )}

        {wantsPersonalization && (
          <fieldset className="mt-6 mb-6 border-0 p-0 m-0">
            <legend className="text-sm font-medium text-ink mb-2">Personalize</legend>
            <div className="flex gap-2 flex-wrap">
              {personalization?.name && (
                <input
                  type="text"
                  value={personalName}
                  onChange={(e) => setPersonalName(e.target.value)}
                  placeholder="Name"
                  aria-label="Personalization name"
                  maxLength={40}
                  className="border border-ink/30 px-3 py-2 text-sm flex-1 min-w-[8rem]"
                />
              )}
              {personalization?.number && (
                <input
                  type="text"
                  value={personalNumber}
                  onChange={(e) => setPersonalNumber(e.target.value)}
                  placeholder="Number"
                  aria-label="Personalization number"
                  maxLength={4}
                  className="border border-ink/30 px-3 py-2 text-sm w-24"
                />
              )}
            </div>
          </fieldset>
        )}

        {!shoppable && (
          <p className="text-sm text-ink-muted mt-6">Not available for ordering right now.</p>
        )}

        <button
          type="button"
          disabled={!selected || !shoppable}
          onClick={() => {
            if (!selected || !shoppable) return;
            const personalizationValue =
              wantsPersonalization && (personalName || personalNumber)
                ? {
                    ...(personalization?.name ? { name: personalName } : {}),
                    ...(personalization?.number ? { number: personalNumber } : {}),
                  }
                : undefined;
            cart.add({
              variantId: selected.id,
              productSlug: slug,
              name,
              size: selected.size,
              color: selected.color,
              unitPriceCents: selected.retailPriceCents,
              imageUrl: images[0]?.url ?? null,
              printfulSyncVariantId: selected.printfulSyncVariantId,
              storeId,
              storeSlug,
              fulfillmentType,
              ...(personalizationValue
                ? { personalization: personalizationValue, lineId: crypto.randomUUID() }
                : {}),
              quantity: 1,
            });
            setAdded(true);
            setPersonalName("");
            setPersonalNumber("");
            setTimeout(() => setAdded(false), 1500);
          }}
          className="mt-8 bg-ink text-cream px-6 py-3 text-sm font-medium uppercase tracking-wide disabled:opacity-50"
        >
          {added ? "Added ✓" : "Add to cart"}
        </button>
      </div>
    </div>
  );
}
