"use client";

import { useMemo, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useCart } from "./cart-store";

export interface ProductDetailVariant {
  id: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
  printfulSyncVariantId: string;
}

export interface ProductDetailProps {
  name: string;
  description: string | null;
  images: { url: string; alt?: string }[];
  variants: ProductDetailVariant[];
  slug: string;
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function ProductDetail({
  name,
  description,
  images,
  variants,
  slug,
}: ProductDetailProps) {
  useHydrationBeacon();

  const cart = useCart();
  const [added, setAdded] = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(
    variants[0]?.id ?? null,
  );

  const selected = useMemo(
    () => variants.find((v) => v.id === selectedId) ?? null,
    [variants, selectedId],
  );

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

        <button
          type="button"
          disabled={!selected}
          onClick={() => {
            if (!selected) return;
            cart.add({
              variantId: selected.id,
              productSlug: slug,
              name,
              size: selected.size,
              color: selected.color,
              unitPriceCents: selected.retailPriceCents,
              imageUrl: images[0]?.url ?? null,
              printfulSyncVariantId: selected.printfulSyncVariantId,
              quantity: 1,
            });
            setAdded(true);
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
