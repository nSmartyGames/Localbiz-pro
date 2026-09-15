"use client";

import { use, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { categories } from "@/lib/products";
import { useCart } from "@/lib/cart-context";
import { PriceTag } from "@/components/store/PriceTag";

// Douglas and Notino both block plain server-side fetches (Akamai bot
// checks) and only scrape through the local headless-browser bridge the
// Sync dashboard drives from the browser (see DashboardClient.tsx's own
// LOCAL_BRIDGE_HOSTS). This admin rescan button posts to a server route
// instead, which can't reach that local bridge — so for these hosts it
// would otherwise silently report "nimic lipsă" instead of the truth.
const LOCAL_BRIDGE_HOSTS = /(^|\.)(douglas\.ro|notino\.ro)$/i;

function needsLocalBridge(url: string): boolean {
  try {
    return LOCAL_BRIDGE_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

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
// section) and the actual description/price-blurb text (shown after).
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

  const [activeImage, setActiveImage] = useState(0);
  const [filledGaps, setFilledGaps] = useState<{
    imageUrl: string | null;
    images: string[];
    priceNow: number | null;
    priceOld: number | null;
  } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [rescanState, setRescanState] = useState<"idle" | "loading" | "done" | "empty" | "needsBridge">("idle");
  const [urlDraft, setUrlDraft] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [urlSaveState, setUrlSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    fetch("/dpstore/api/admin/status")
      .then((res) => res.json())
      .then((data) => setIsAdmin(Boolean(data?.isAdmin)))
      .catch(() => {});
  }, []);

  const fetchGapFill = useCallback((productId: string) => {
    return fetch("/dpstore/api/store/fill-product-gaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.updated) {
          setFilledGaps(data.updated);
          setRescanState("done");
        } else {
          setRescanState("empty");
        }
      })
      .catch(() => setRescanState("empty"));
  }, []);

  // Admin-only manual trigger: sets the visible "loading" state, then reuses
  // the same fetch the silent auto-heal effect below uses. Douglas/Notino
  // URLs can't be scraped by this server route at all (see needsLocalBridge
  // above) — surface that instead of firing a request doomed to no-op.
  const runRescan = useCallback(
    (productId: string, productUrl: string) => {
      if (needsLocalBridge(productUrl)) {
        setRescanState("needsBridge");
        return;
      }
      setRescanState("loading");
      fetchGapFill(productId);
    },
    [fetchGapFill]
  );

  const saveProductUrl = useCallback((productId: string, productUrl: string) => {
    setUrlSaveState("saving");
    fetch("/dpstore/api/admin/update-product-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, productUrl }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.error) throw new Error(data.error);
        setSavedUrl(productUrl);
        setUrlDraft(null);
        setUrlSaveState("saved");
        if (data?.imageUrl) {
          setFilledGaps((current) => ({
            imageUrl: data.imageUrl,
            images: data.images ?? [],
            priceNow: current?.priceNow ?? null,
            priceOld: current?.priceOld ?? null,
          }));
        }
      })
      .catch(() => setUrlSaveState("error"));
  }, []);

  // A product row can carry a real "Product URL" but still be missing the
  // image or price the Sync import didn't manage to scrape. Re-run that same
  // scrape once per page visit, on demand, so the gap self-heals in Airtable
  // (and on screen) without a manual re-sync. Runs for every visitor, silently
  // (no loading state) — the visible rescan button above is admin-only.
  useEffect(() => {
    if (!product?.productUrl || needsLocalBridge(product.productUrl)) return;
    const missingImage = product.imageUrl === null || /^https:\/\/picsum\.photos\//i.test(product.imageUrl);
    const missingPrice = product.priceNow === null;
    if (!missingImage && !missingPrice) return;
    fetchGapFill(product.id);
  }, [product?.id, product?.productUrl, product?.imageUrl, product?.priceNow, fetchGapFill]);

  if (!product) {
    notFound();
  }

  const displayProduct = {
    ...product,
    ...(filledGaps
      ? {
          imageUrl: filledGaps.imageUrl ?? product.imageUrl,
          images: filledGaps.images.length > 0 ? filledGaps.images : product.images,
          priceNow: filledGaps.priceNow ?? product.priceNow,
          priceOld: filledGaps.priceOld ?? product.priceOld,
        }
      : {}),
    productUrl: savedUrl ?? product.productUrl,
  };

  const gallery = displayProduct.imageUrl
    ? [displayProduct.imageUrl, ...(displayProduct.images ?? []).filter((src) => src !== displayProduct.imageUrl)]
    : [];

  const category = categories.find((c) => c.slug === displayProduct.category);
  const inStock = displayProduct.priceNow !== null;
  const { extra: extraInfo, main: mainDescription } = splitDescriptionSections(displayProduct.description);

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
                alt={displayProduct.name}
                width={420}
                height={420}
                priority
                className="max-h-96 w-auto object-contain"
              />
            ) : (
              <div className="flex h-56 w-56 items-center justify-center rounded-full bg-[#4B2354] text-4xl font-semibold tracking-wide text-white">
                {initials(displayProduct.name)}
              </div>
            )}
            {!displayProduct.isReal && (
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
            {displayProduct.name}
          </h1>
          <div className="mb-5 text-base text-[#6b676b]">{displayProduct.size}</div>
          <div className="mb-6">
            <PriceTag
              priceNow={displayProduct.priceNow}
              priceOld={displayProduct.priceOld}
              pricePerMl={displayProduct.pricePerMl}
              currency={displayProduct.currency}
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

          <div className="mt-8 border-t border-[#e6e3e5] pt-6">
            <h2 className="mb-6 text-xs font-semibold uppercase tracking-[0.18em] text-[#b08d57]">
              Detalii produs
            </h2>
            {extraInfo && (
              <div className="mb-5 whitespace-pre-line border-b border-[#e6e3e5] pb-5 text-sm leading-relaxed text-[#6b676b]">
                {extraInfo}
              </div>
            )}
            <div className="whitespace-pre-line text-[15px] leading-[1.85] text-[#3d393d]">
              {mainDescription || "Fără descriere disponibilă."}
            </div>

            {isAdmin && (
              <div className="mt-5 rounded-md border border-dashed border-[#e6e3e5] bg-[#faf8f4] p-4 text-xs text-[#6b676b]">
                <div className="mb-2 font-semibold uppercase tracking-wide text-[#b08d57]">Admin: sursă produs</div>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <input
                    type="url"
                    value={urlDraft ?? displayProduct.productUrl ?? ""}
                    onChange={(e) => {
                      setUrlDraft(e.target.value);
                      setUrlSaveState("idle");
                    }}
                    placeholder="https://..."
                    className="min-w-0 flex-1 rounded-sm border border-[#e6e3e5] bg-white px-2 py-1.5 text-xs text-[#242124] focus:border-[#301934] focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={urlSaveState === "saving" || !(urlDraft ?? displayProduct.productUrl)}
                    onClick={() => saveProductUrl(displayProduct.id, (urlDraft ?? displayProduct.productUrl)!.trim())}
                    className="rounded-sm border border-[#301934] px-3 py-1.5 font-semibold text-[#301934] hover:bg-[#301934] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {urlSaveState === "saving" ? "Se salvează…" : "Salvează"}
                  </button>
                </div>
                {urlSaveState === "saved" && (
                  <div className="mb-3 text-[#4B2354]">URL actualizat.</div>
                )}
                {urlSaveState === "error" && (
                  <div className="mb-3 text-[#b3261e]">Salvarea a eșuat — încearcă din nou.</div>
                )}
                {displayProduct.productUrl && (
                  <button
                    type="button"
                    disabled={rescanState === "loading"}
                    onClick={() => runRescan(displayProduct.id, displayProduct.productUrl!)}
                    className="rounded-sm border border-[#301934] px-3 py-1.5 font-semibold text-[#301934] hover:bg-[#301934] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rescanState === "loading" ? "Se rescanează…" : "Rescanează produsul"}
                  </button>
                )}
                {rescanState === "done" && (
                  <span className="ml-3 text-[#4B2354]">Actualizat din pagina sursă.</span>
                )}
                {rescanState === "empty" && (
                  <span className="ml-3 text-[#6b6b66]">Nimic lipsă de completat.</span>
                )}
                {rescanState === "needsBridge" && (
                  <span className="ml-3 text-[#b3261e]">
                    Douglas/Notino necesită bridge-ul local — rulează-l din Sync (dashboard).
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
