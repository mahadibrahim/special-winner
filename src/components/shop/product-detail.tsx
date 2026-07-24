"use client";

import { useMemo, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

export interface ProductDetailVariant {
  id: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
}

export interface ProductDetailProps {
  name: string;
  description: string | null;
  images: { url: string; alt?: string }[];
  variants: ProductDetailVariant[];
}

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export default function ProductDetail({
  name,
  description,
  images,
  variants,
}: ProductDetailProps) {
  useHydrationBeacon();

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

        {/* Phase 2 adds an Add-to-cart button here. */}
        <p className="mt-8 text-sm text-ink-muted">
          Online ordering opens soon.
        </p>
      </div>
    </div>
  );
}
