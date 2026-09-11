"use client";

import { use, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categories } from "@/lib/products";
import { useCart } from "@/lib/cart-context";
import { PriceTag } from "@/components/store/PriceTag";

function initials(name: string): string {
  return name
    .replace(/^The\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

// Splits a product's Description into the unmatched-JSON-column lines the
// Sync import folds in as "Column: value" (shown first in the details
// drawer) and the actual description/price-blurb text (shown after).
function splitDescriptionSections(description: string): { extra: string; main: string } {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^(Product\s*URL|Product\s*Image[s]?|Image\s*URL|Product\s*Images?|Gallery)\s*:/i.test(line)) return false;
      if (/^https?:\/\//i.test(line)) return false;
      return true;
    });

  const isExtraField = (line: string) => /^[^:]{2,40}:\s+\S/.test(line);
  const extra = lines.filter(isExtraField);
  const main = lines.filter((line) => !isExtraField(line));

  return {
    extra: extra.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
    main: main.join("\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
}

export default function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { addItem, getProduct } = useCart();
  const product = getProduct(id);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);

  const gallery = product?.imageUrl
    ? [product.imageUrl, ...(product.images ?? [])]
    : [];
  const [activeImage, setActiveImage] = useState(0);

  if (!product) {
    notFound();
  }

  const category = categories.find((c) => c.slug === product.category);
  const inStock = product.priceNow !== null;
  const { extra: extraInfo, main: mainDescription } = splitDescriptionSections(product.description);

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 text-[#242124]">
      {category && (
        <Link
          href={`/store/c/${category.slug}`}
          className="mb-8 inline-block text-xs font-semibold uppercase tracking-wide text-[#301934] hover:underline"
        >
          &larr; {category.name}
        </Link>
      )}

      <div className="grid grid-cols-1 items-start gap-10 md:grid-cols-2 md:gap-16">
        <div>
          <div className="relative flex items-center justify-center rounded-lg border border-[#e4ddd0] bg-white p-10">
            {gallery.length > 0 ? (
              <Image
                src={gallery[activeImage]}
                alt={product.name}
                width={420}
                height={420}
                priority
                className="max-h-96 w-auto object-contain"
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-full bg-[#4B2354] text-4xl font-semibold tracking-wide text-white">
                {initials(product.name)}
              </div>
            )}
            {!product.isReal && (
              <span className="absolute right-4 top-4 rounded-full border border-[#e4ddd0] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b6b66]">
                Demo
              </span>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="mt-4 flex gap-3 overflow-x-auto">
              {gallery.map((src, i) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => setActiveImage(i)}
                  className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border bg-white p-1 ${
                    i === activeImage ? "border-[#4B2354]" : "border-[#e4ddd0]"
                  }`}
                  aria-label={`Imagine ${i + 1}`}
                >
                  <Image
                    src={src}
                    alt=""
                    width={64}
                    height={64}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {category && (
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#C9A227]">
              {category.name}
            </div>
          )}
          <h1 className="mb-2 text-3xl font-medium leading-tight text-[#242124] md:text-4xl">
            {product.name}
          </h1>
          <div className="mb-5 text-base text-[#6b676b]">{product.size}</div>
          <button
            type="button"
            onClick={() => setIsDescriptionOpen(true)}
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#301934] underline underline-offset-4 hover:text-[#4B2354]"
          >
            Detalii produs / Descriere
          </button>
          <div className="mb-6">
            <PriceTag
              priceNow={product.priceNow}
              priceOld={product.priceOld}
              pricePerMl={product.pricePerMl}
              currency={product.currency}
              light
            />
          </div>

          {inStock ? (
            <div className="flex flex-wrap items-center gap-4">
              <select
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
                className="rounded-sm border border-[#e6e3e5] bg-white px-4 py-3 text-sm text-[#242124] focus:border-[#301934] focus:outline-none"
                aria-label="Cantitate"
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} buc
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  addItem(product.id, qty);
                  setAdded(true);
                  window.setTimeout(() => setAdded(false), 2000);
                }}
                className="store-button store-button-primary transition-colors"
              >
                Adaugă în coș
              </button>
              {added && (
                <span className="text-sm font-medium text-[#4B2354]">
                  Adăugat în coș.
                </span>
              )}
            </div>
          ) : (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-md bg-[#e4ddd0] p-[5px] text-sm font-bold uppercase tracking-wide text-[#6b6b66]"
            >
              Notifică-mă la stoc
            </button>
          )}
        </div>
      </div>

      {isDescriptionOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsDescriptionOpen(false)}
            aria-hidden="true"
          />
          <div className="relative flex h-full w-full max-w-md flex-col overflow-y-auto bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-medium text-[#242124]">Detalii produs</h2>
              <button
                type="button"
                onClick={() => setIsDescriptionOpen(false)}
                className="text-2xl leading-none text-[#6b676b] hover:text-[#242124]"
                aria-label="Închide"
              >
                &times;
              </button>
            </div>
            {extraInfo && (
              <div className="mb-4 whitespace-pre-line border-b border-[#e6e3e5] pb-4 text-sm text-[#6b676b]">
                {extraInfo}
              </div>
            )}
            <div className="whitespace-pre-line text-[15px] leading-relaxed text-[#3d393d]">
              {mainDescription || "Fără descriere disponibilă."}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
