"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { formatPrice } from "@/components/store/PriceTag";

function initials(name: string): string {
  return name
    .replace(/^The\s+/i, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CartPage() {
  const {
    items,
    setQty,
    removeItem,
    subtotal,
    subtotalCurrency,
    getProduct,
  } = useCart();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resolved = items
    .map((item) => ({ item, product: getProduct(item.productId) }))
    .filter(
      (entry): entry is { item: typeof entry.item; product: NonNullable<typeof entry.product> } =>
        entry.product !== undefined
    );

  const isEmpty = resolved.length === 0;

  async function handleCheckout() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });

      const data: { url?: string; error?: string } = await res.json();

      if (data.url) {
        window.location.href = data.url;
        return;
      }

      setError(data.error ?? "A apărut o eroare la inițierea plății.");
    } catch {
      setError("A apărut o eroare la inițierea plății. Încearcă din nou.");
    } finally {
      setLoading(false);
    }
  }

  if (isEmpty) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h1 className="mb-3 text-2xl font-semibold text-[#0f1b1a]">
          Coșul tău este gol.
        </h1>
        <p className="mb-8 text-sm text-[#6b6b66]">
          Descoperă gama La Mer și adaugă produsele preferate în coș.
        </p>
        <Link
          href="/store"
          className="inline-block rounded-md bg-[#4B2354] p-[5px] text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#341739]"
        >
          Înapoi la magazin
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <h1 className="mb-8 text-2xl font-semibold text-[#0f1b1a]">
        Coșul tău
      </h1>

      <div className="divide-y divide-[#e4ddd0] border-y border-[#e4ddd0]">
        {resolved.map(({ item, product }) => {
          const lineTotal =
            product.priceNow !== null ? product.priceNow * item.qty : null;
          return (
            <div
              key={item.productId}
              className="flex flex-wrap items-center gap-4 py-5"
            >
              <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-md border border-[#e4ddd0] bg-white p-2">
                {product.imageUrl ? (
                  <Image
                    src={product.imageUrl}
                    alt={product.name}
                    width={72}
                    height={72}
                    className="max-h-16 w-auto object-contain"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#4B2354] text-sm font-semibold text-white">
                    {initials(product.name)}
                  </div>
                )}
              </div>

              <div className="min-w-[180px] flex-1">
                <Link
                  href={`/store/p/${product.id}`}
                  className="text-sm font-semibold text-[#0f1b1a] hover:underline"
                >
                  {product.name}
                </Link>
                <div className="text-xs text-[#6b6b66]">{product.size}</div>
              </div>

              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`qty-${item.productId}`}>
                  Cantitate
                </label>
                <select
                  id={`qty-${item.productId}`}
                  value={item.qty}
                  onChange={(e) =>
                    setQty(item.productId, Number(e.target.value))
                  }
                  className="rounded-md border border-[#e4ddd0] bg-white px-3 py-2 text-sm text-[#0f1b1a] focus:border-[#4B2354] focus:outline-none"
                >
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => removeItem(item.productId)}
                  className="text-xs font-semibold uppercase tracking-wide text-[#6b6b66] hover:text-[#b23b3b]"
                >
                  Elimină
                </button>
              </div>

              <div className="w-28 text-right text-sm font-semibold text-[#0f1b1a]">
                {lineTotal !== null
                  ? formatPrice(lineTotal, product.currency)
                  : "Preț la cerere"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col items-end gap-2">
        <div className="text-lg font-bold text-[#0f1b1a]">
          Subtotal:{" "}
          {subtotalCurrency ? formatPrice(subtotal, subtotalCurrency) : "Monede multiple"}
        </div>
        <p className="max-w-sm text-right text-xs text-[#6b6b66]">
          Codurile promoționale se introduc la pasul de plată.
        </p>

        {error && (
          <div className="w-full max-w-sm rounded-md border border-[#f3c9c9] bg-[#fbe9e9] px-4 py-3 text-right text-sm font-medium text-[#b23b3b]">
            {error}
          </div>
        )}

        <button
          type="button"
          disabled={loading}
          onClick={handleCheckout}
          className="mt-2 rounded-md bg-[#4B2354] p-[5px] text-sm font-bold uppercase tracking-wide text-white transition-colors hover:bg-[#341739] disabled:cursor-not-allowed disabled:bg-[#e4ddd0] disabled:text-[#6b6b66]"
        >
          {loading ? "Se procesează..." : "Finalizează comanda"}
        </button>
      </div>
    </main>
  );
}
