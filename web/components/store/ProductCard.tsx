"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/products";
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

function displayDescription(description: string): string {
  const cleanedLines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^(Product\s*URL|Product\s*Image[s]?|Image\s*URL|Product\s*Images?|Gallery)\s*:/i.test(trimmed)) {
        return false;
      }
      if (/^https?:\/\//i.test(trimmed)) {
        return false;
      }
      return true;
    });

  return cleanedLines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const inStock = product.priceNow !== null;
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  return (
    <div className="store-product-card group flex h-full flex-col overflow-hidden">
      <Link href={`/store/p/${product.id}`} className="flex flex-1 flex-col">
        <div className="store-product-image relative flex h-56 items-center justify-center p-0">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              width={220}
              height={220}
              className="max-h-44 w-auto object-contain"
            />
          ) : (
            <div className="flex h-32 w-32 flex-col items-center justify-center rounded-none bg-[#4B2354] text-2xl font-semibold tracking-wide text-white">
              {initials(product.name)}
            </div>
          )}
          {!product.isReal && (
            <span className="absolute right-3 top-3 rounded-full border border-[#e4ddd0] bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#6b6b66]">
              Demo
            </span>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-1.5 p-4">
          <h3 className="store-product-name text-sm font-semibold leading-snug">
            {product.name}
          </h3>
          <div className="store-product-meta text-xs">{product.size}</div>
          <p className="store-product-description line-clamp-1 text-xs">
            {displayDescription(product.description)}
          </p>
          <div className="mt-auto pt-2">
            <PriceTag
              priceNow={product.priceNow}
              priceOld={product.priceOld}
              currency={product.currency}
            />
          </div>
        </div>
      </Link>
      <div className="flex flex-col gap-2 p-4 pt-0">
        {inStock ? (
          <div className="flex items-center gap-2">
            <select
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="rounded-sm border border-[#e6e3e5] bg-white px-2 py-2 text-xs text-[#242124] focus:border-[#301934] focus:outline-none"
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
              className="store-add-button flex-1 border-0 bg-transparent px-4 text-xs font-semibold uppercase tracking-wide transition-colors"
            >
              Adaugă în coș
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled
            className="store-add-button w-full border-0 bg-transparent px-4 text-xs font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:text-[#6b6b66] disabled:hover:bg-transparent"
          >
            Notifică-mă la stoc
          </button>
        )}
        {added && (
          <span className="text-center text-xs font-medium text-[#4B2354]">
            Adăugat în coș.
          </span>
        )}
      </div>
    </div>
  );
}
