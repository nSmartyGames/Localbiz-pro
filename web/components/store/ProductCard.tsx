"use client";

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
      <div>
        <button
          type="button"
          disabled={!inStock}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (inStock) addItem(product.id);
          }}
          className="store-add-button w-full border-0 bg-transparent px-4 text-xs font-semibold uppercase tracking-wide transition-colors disabled:cursor-not-allowed disabled:text-[#6b6b66] disabled:hover:bg-transparent"
        >
          {inStock ? "Adaugă în coș" : "Notifică-mă la stoc"}
        </button>
      </div>
    </div>
  );
}
