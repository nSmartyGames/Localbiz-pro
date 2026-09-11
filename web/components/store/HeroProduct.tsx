"use client";

import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/products";
import { useCart } from "@/lib/cart-context";
import { PriceTag } from "@/components/store/PriceTag";

export function HeroProduct({
  product,
  categoryName,
}: {
  product: Product;
  categoryName: string;
}) {
  const { addItem } = useCart();
  const inStock = product.priceNow !== null;
  const productHref = `/store/p/${product.id}`;

  return (
    <section className="border-b border-[#e4ddd0] bg-[#f7f3ec] p-[20px]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-14 md:grid-cols-2 md:gap-16">
        <div>
          <div className="relative flex items-center justify-center rounded-lg border border-[#e4ddd0] bg-white p-10">
            <span className="absolute left-4 top-4 rounded-full bg-[#C9A227] p-[5px] text-[11px] font-semibold uppercase tracking-wide text-white">
              {product.priceOld ? "Cel mai vândut" : "Recomandat"}
            </span>
            <Link href={productHref} className="block">
              {product.imageUrl ? (
                <Image
                  src={product.imageUrl}
                  alt={product.name}
                  width={420}
                  height={420}
                  priority
                  className="max-h-96 w-auto object-contain"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-full bg-[#4B2354] text-4xl font-semibold tracking-wide text-white">
                  {product.name
                    .replace(/^The\s+/i, "")
                    .split(/\s+/)
                    .slice(0, 2)
                    .map((w) => w[0]?.toUpperCase())
                    .join("")}
                </div>
              )}
            </Link>
          </div>

          {product.images && product.images.length > 1 && (
            <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
              {product.images.map((src, index) => (
                <Link
                  key={`${product.id}-${src}`}
                  href={productHref}
                  className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-md border bg-white p-1 ${index === 0 ? "border-[#4B2354]" : "border-[#e4ddd0]"}`}
                  aria-label={`Vezi imaginea ${index + 1} pentru ${product.name}`}
                >
                  <Image
                    src={src}
                    alt={`${product.name} - imagine ${index + 1}`}
                    width={64}
                    height={64}
                    className="h-full w-full object-contain"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div>
          <Link href={productHref} className="block">
            <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#C9A227]">
              {categoryName}
            </div>
            <h1 className="mb-2 text-3xl font-semibold leading-tight text-[#0f1b1a] md:text-4xl">
              {product.name}
            </h1>
            <div className="mb-5 text-base text-[#6b6b66]">{product.size}</div>
            <p className="mb-6 text-[15px] leading-relaxed text-[#333]">
              {product.description}
            </p>
            <div className="mb-6">
              <PriceTag
                priceNow={product.priceNow}
                priceOld={product.priceOld}
                pricePerMl={product.pricePerMl}
              />
            </div>
          </Link>

          <button
            type="button"
            disabled={!inStock}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (inStock) addItem(product.id);
            }}
            className="rounded-md bg-[#4B2354] p-[5px] text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#341739] disabled:cursor-not-allowed disabled:bg-[#e4ddd0] disabled:text-[#6b6b66]"
          >
            {inStock ? "Adaugă în coș" : "Notifică-mă la stoc"}
          </button>
        </div>
      </div>
    </section>
  );
}
