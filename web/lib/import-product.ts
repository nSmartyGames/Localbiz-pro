import { createHash } from "crypto";
import { Storage } from "@google-cloud/storage";
import type { ExistingProductIndex } from "@/lib/airtable-products";

// Thrown instead of a plain Error when a row matches an already-imported
// product (by name or Product URL), so the route can flag it separately
// from a genuine import failure.
export class DuplicateProductError extends Error {}

// Pulls extra gallery images straight off the product's own page, since
// scraped JSON exports often carry only one hero shot. Static-HTML only
// (og:image meta, JSON-LD "image", and <img> tags that look gallery-ish) —
// no headless browser, so client-rendered galleries (React/Angular SPAs)
// won't be picked up. Best-effort: any failure just yields no extra images.
async function scrapeProductGallery(productUrl: string): Promise<string[]> {
  try {
    const response = await fetch(productUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaViveBot/1.0)" },
      cache: "no-store",
    });
    if (!response.ok) return [];
    const html = await response.text();
    const primary = new Set<string>();

    for (const match of html.matchAll(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["'][^>]*>/gi)) {
      primary.add(match[1]);
    }
    for (const match of html.matchAll(/"image"\s*:\s*(\[[^\]]*\]|"[^"]+")/gi)) {
      try {
        const parsed = JSON.parse(match[1]);
        for (const value of Array.isArray(parsed) ? parsed : [parsed]) {
          if (typeof value === "string") primary.add(value);
        }
      } catch {
        continue;
      }
    }

    // <img> tags matching "product/gallery/zoom" catch this product's own
    // image variants, but also match unrelated "related products" carousels
    // elsewhere on the page. Anchor to the numeric id segment (e.g.
    // ".../gallery/136508/...") from the primary image's own path, if it has
    // one, and only keep <img> matches that share that same id — otherwise
    // fall back to the unscoped match.
    const anchorImage = Array.from(primary)[0];
    const anchorId = anchorImage?.match(/\/([a-z0-9_-]*\d{4,}[a-z0-9_-]*)\//i)?.[1];

    const candidates = new Set<string>();
    for (const match of html.matchAll(/<img[^>]+(?:data-)?src=["']([^"']+)["'][^>]*>/gi)) {
      if (/product|gallery|zoom/i.test(match[1])) candidates.add(match[1]);
    }
    // If the anchor id happens to match nothing among the candidates (e.g.
    // it came from an unrelated number in the image URL, not a real gallery
    // id), scoping down to an empty set would silently drop every gallery
    // image — fall back to the unscoped candidates instead.
    const anchorScoped = anchorId ? Array.from(candidates).filter((src) => src.includes(anchorId)) : [];
    const scoped = anchorScoped.length > 0 ? anchorScoped : Array.from(candidates);

    return Array.from(new Set([...primary, ...scoped]))
      .map((url) => (url.startsWith("//") ? `https:${url}` : url))
      .filter((url) => /^https?:\/\//i.test(url))
      // A PDP template defaulting og:image/JSON-LD "image" to its own
      // canonical URL when no real photo is set would otherwise import the
      // product page link itself as if it were a photo.
      .filter((url) => url !== productUrl)
      .slice(0, 8);
  } catch {
    return [];
  }
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LaViveBot/1.0)" },
      cache: "no-store",
    });
    return response.ok ? await response.text() : null;
  } catch {
    return null;
  }
}

// Reads schema.org Product/Offer JSON-LD, if the page carries any. Price
// (the offer's own price) maps to "now", highPrice (present when a site
// publishes a discount range) maps to "old"/full price.
function extractJsonLdOffer(html: string): { priceNow: number | null; priceOld: number | null; description: string | null } {
  const result: { priceNow: number | null; priceOld: number | null; description: string | null } = {
    priceNow: null,
    priceOld: null,
    description: null,
  };
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      for (const item of Array.isArray(data) ? data : [data]) {
        const offers = item?.offers ? (Array.isArray(item.offers) ? item.offers : [item.offers]) : [];
        for (const offer of offers) {
          const price = Number(offer?.price ?? offer?.lowPrice);
          if (result.priceNow === null && Number.isFinite(price)) result.priceNow = price;
          const highPrice = Number(offer?.highPrice);
          if (result.priceOld === null && Number.isFinite(highPrice)) result.priceOld = highPrice;
        }
        if (result.description === null && typeof item?.description === "string" && item.description.trim()) {
          result.description = item.description.trim();
        }
      }
    } catch {
      continue;
    }
  }
  return result;
}

// Romanian price-labeling words vary a lot ("Preț recomandat", "redus de
// la", "reducere") — pulled from the tag text that mentions one of them
// alongside a digit, since that's usually the sentence explaining the
// discount (e.g. "Preț recomandat 199 lei, redus la 149 lei").
const PRICE_DESCRIPTION_PATTERN = /(pre[tț]\s*(actual|recomandat|redus|de\s*vanzare)|reducere|redus\s+de\s+la|discount)/i;

function extractPriceDescriptionFromHtml(html: string): string | null {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  for (const match of withoutScripts.matchAll(/>([^<]{2,160})</g)) {
    const text = match[1].replace(/\s+/g, " ").trim();
    if (text && /\d/.test(text) && PRICE_DESCRIPTION_PATTERN.test(text)) return text;
  }
  return null;
}

function extractMetaDescription(html: string): string | null {
  const match = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  return match ? match[1].trim() || null : null;
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:br|\/p|\/div|\/li|\/tr|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]*\n+/g, "\n\n")
    .trim();
}

// Extracts just the text inside the element carrying
// data-testid="product-information" — a narrow, on-demand scrape triggered
// by the Sync page's own "open" button for one product at a time, as
// opposed to scrapeProductPage's page-wide, best-effort description guess.
// Walks tag depth from the opening tag to find its own matching close tag,
// since the section can contain arbitrarily nested markup.
function extractProductInformationSection(html: string): string | null {
  const openTagMatch = html.match(/<([a-z][a-z0-9]*)\b[^>]*\bdata-testid=["']product-information["'][^>]*>/i);
  if (!openTagMatch) return null;
  const tagName = openTagMatch[1].toLowerCase();
  const contentStart = openTagMatch.index! + openTagMatch[0].length;

  const tagPattern = new RegExp(`<(/?)${tagName}\\b[^>]*>`, "gi");
  tagPattern.lastIndex = contentStart;
  let depth = 1;
  let match: RegExpExecArray | null;
  let contentEnd = html.length;
  while ((match = tagPattern.exec(html))) {
    if (match[1] === "/") {
      depth -= 1;
      if (depth === 0) {
        contentEnd = match.index;
        break;
      }
    } else {
      depth += 1;
    }
  }

  const text = stripHtmlToText(html.slice(contentStart, contentEnd));
  return text || null;
}

export async function scrapeProductInformation(productUrl: string): Promise<string | null> {
  const html = await fetchHtml(productUrl);
  return html ? extractProductInformationSection(html) : null;
}

// Best-effort product name, in the same priority order most PDPs actually
// carry it: schema.org Product JSON-LD (most reliable, when present), then
// og:title (usually just the product name, no site suffix), then the page's
// own <h1>, then <title> as a last resort (often "Name — Site" and noisiest,
// hence last). Never throws; a page with none of these just yields null.
function extractProductName(html: string): string | null {
  for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(match[1]);
      for (const item of Array.isArray(data) ? data : [data]) {
        if (item?.["@type"] === "Product" && typeof item?.name === "string" && item.name.trim()) {
          return item.name.trim();
        }
      }
    } catch {
      continue;
    }
  }
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if (ogTitle?.[1]?.trim()) return ogTitle[1].trim();
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1Text = h1 ? stripHtmlToText(h1[1]).trim() : "";
  if (h1Text) return h1Text;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const titleText = title ? stripHtmlToText(title[1]).trim() : "";
  return titleText || null;
}

// Best-effort scrape of a product's own page — name, price, a
// human-readable price blurb (prepended to Description), and gallery
// images. Used both to fill in whatever the uploaded JSON's own columns
// didn't carry, and so the Sync page's "Adaugă produs după URL" box can
// build a whole new row from just a pasted URL. Returns all-empty fields
// (never throws) when nothing is found or the page can't be fetched, so
// callers can treat that as "ask the user". Plain fetch only — sites that
// block bots (e.g. Douglas's Akamai check) get nothing back here and need
// the douglas-scraper bridge's real-browser flow instead.
export async function scrapeProductPage(
  productUrl: string
): Promise<{ name: string | null; priceNow: number | null; priceOld: number | null; description: string | null; images: string[] }> {
  const html = await fetchHtml(productUrl);
  if (!html) return { name: null, priceNow: null, priceOld: null, description: null, images: [] };
  const jsonLd = extractJsonLdOffer(html);
  const description = jsonLd.description ?? extractPriceDescriptionFromHtml(html) ?? extractMetaDescription(html);
  const images = await scrapeProductGallery(productUrl);
  const name = extractProductName(html);
  return { name, priceNow: jsonLd.priceNow, priceOld: jsonLd.priceOld, description, images };
}

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export async function uploadImage(imageUrl: string, productId: string, index = 0) {
  const bucket = required("GOOGLE_CLOUD_STORAGE_BUCKET");
  const storage = new Storage({
    projectId: process.env.GOOGLE_CLOUD_PROJECT ?? "g-hub-393209",
    ...(process.env.GOOGLE_SERVICE_ACCOUNT_JSON
      ? { credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON) }
      : {}),
  });
  const imageResponse = await fetch(imageUrl, { cache: "no-store" });
  if (!imageResponse.ok) throw new Error(`Image could not be downloaded: ${imageUrl}`);
  const contentType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  const extension = contentType.split("/")[1] || "jpg";
  const buffer = Buffer.from(await imageResponse.arrayBuffer());
  // Content-hashed name: a re-import whose source image actually changed
  // (e.g. a scraper fix now pulling a bigger version of the same photo)
  // gets a brand-new object, so the "immutable, 1-year" Cache-Control below
  // never needs to be invalidated — it's set once, on a URL guaranteed to
  // always point at exactly these bytes. The old scheme (name = productId
  // only) overwrote the SAME "immutable" URL with different bytes on every
  // re-import, which left GCS's own edge cache, Next.js's Image Optimizer
  // cache, and every visitor's browser cache serving the stale image for up
  // to a year — Airtable and the bucket both had the new image, but nothing
  // that had ever fetched the old URL would know to ask again.
  const hash = createHash("sha1").update(buffer).digest("hex").slice(0, 10);
  const objectName = `products/${productId}-${hash}${index ? `-${index}` : ""}.${extension}`;
  await storage
    .bucket(bucket)
    .file(objectName)
    .save(buffer, {
      resumable: false,
      metadata: {
        contentType,
        cacheControl: "public, max-age=31536000, immutable",
      },
    });
  return `https://storage.googleapis.com/${bucket}/${objectName}`;
}

function slugify(value: string): string {
  return (
    value
      .toLocaleLowerCase("ro-RO")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "product"
  );
}

function pick(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  return undefined;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function sourceImagesFromRow(row: Record<string, unknown>): string[] {
  const single = toText(pick(row, "Image URL", "Image", "image"));
  const raw = pick(row, "Product Images", "Images", "images");
  const urls = [
    ...(single ? [single] : []),
    ...(typeof raw === "string" ? raw.split(",").map((entry) => entry.trim()) : []),
    ...(Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === "string") : []),
  ];
  return Array.from(new Set(urls)).filter((url) => /^https?:\/\//i.test(url));
}

// Keys that map onto a known Products table field, so they never leak into
// the "extra fields" fallback below. Compared case-insensitively against
// each row's own keys, since uploaded JSON headers aren't guaranteed casing.
const CONSUMED_KEYS = new Set([
  "name",
  "category",
  "size",
  "description",
  "price",
  "old price",
  "priceold",
  "discount",
  "currency",
  "product url",
  "producturl",
  "image url",
  "imageurl",
  "image",
  "product images",
  "images",
  "__overwrite",
]);

// Any JSON field with no corresponding Airtable column has nowhere else to
// go, so it's folded into Description as "Key: value" lines rather than
// silently dropped.
function extraFieldsText(row: Record<string, unknown>): string {
  return Object.entries(row)
    .filter(
      ([key, value]) =>
        !CONSUMED_KEYS.has(key.trim().toLowerCase()) && value !== null && value !== undefined && value !== ""
    )
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(", ") : String(value)}`)
    .join("\n");
}

type OverwriteMode = "images" | "allWithoutImages" | "all";

// Imports one row of a user-supplied JSON table into the Products table.
// Row keys are matched against known Airtable field names (Name, Size,
// Description, Price, "Old Price", Currency, "Image URL"/"Product Images",
// "Product URL", Category); everything else is appended to Description.
// Category is assigned per row by the dashboard's dropdown before the row
// ever reaches here, so it's read the same way as any other field.
//
// A row matching an existing product (by Name or Product URL) is rejected
// with DuplicateProductError UNLESS the row carries "__overwrite" (set by
// the dashboard when the user explicitly checked an "already exists" row) —
// in that case the existing Airtable record is PATCHed instead of a new one
// being POSTed, and "images" mode leaves every non-image field untouched
// while "allWithoutImages" rebuilds every field except the image ones.
export async function importProductRow(
  row: Record<string, unknown>,
  index: number,
  existing: ExistingProductIndex
): Promise<{ name: string; category: string; airtableId: string; imageUrl: string | null; overwritten: boolean }> {
  const name = toText(pick(row, "Name", "name"));
  if (!name) throw new Error(`Row ${index + 1}: missing "Name".`);
  const category = toText(pick(row, "Category", "category"));
  if (!category) throw new Error(`Row ${index + 1} (${name}): missing category.`);
  const productUrl = toText(pick(row, "Product URL", "productUrl")) ?? null;
  const overwrite = toText(pick(row, "__overwrite")) as OverwriteMode | undefined;

  const existingId = existing.byName.get(name.trim().toLowerCase()) ?? (productUrl ? existing.byUrl.get(productUrl) : undefined);
  if (existingId && !overwrite) {
    throw new DuplicateProductError(`Rândul ${index + 1} (${name}): produsul există deja, ignorat.`);
  }

  const productId = existingId ?? `${slugify(name)}-${index + 1}`;
  const includeImages = overwrite !== "allWithoutImages";

  let uploadedImages: string[] = [];
  if (includeImages) {
    const galleryImages = productUrl ? await scrapeProductGallery(productUrl) : [];
    const sourceImages = Array.from(new Set([...sourceImagesFromRow(row), ...galleryImages]));
    uploadedImages = sourceImages.length
      ? await Promise.all(sourceImages.map((url, imageIndex) => uploadImage(url, productId, imageIndex)))
      : [];
  }

  let fields: Record<string, unknown>;
  if (overwrite === "images") {
    fields = {
      "Image URL": uploadedImages[0] ?? "",
      "Product Images": uploadedImages.join(", "),
    };
  } else {
    const priceNow = toNumber(pick(row, "Price", "price"));
    const priceOld = toNumber(pick(row, "Old Price", "priceOld"));
    const discount =
      priceNow !== null && priceOld !== null && priceOld > priceNow
        ? Math.round(((priceOld - priceNow) / priceOld) * 100)
        : toNumber(pick(row, "Discount", "discount"));
    const description = [toText(pick(row, "Description", "description")) ?? "", extraFieldsText(row)]
      .filter(Boolean)
      .join("\n\n");

    fields = {
      Name: name,
      Category: category,
      Size: toText(pick(row, "Size", "size")) ?? "",
      Description: description,
      Price: priceNow,
      "Old Price": priceOld,
      Discount: discount,
      Currency: pick(row, "Currency", "currency") === "USD" ? "USD" : "RON",
      "Product URL": productUrl,
      ...(includeImages ? { "Image URL": uploadedImages[0] ?? "" } : {}),
      ...(includeImages ? { "Product Images": uploadedImages.join(", ") } : {}),
    };
  }

  const baseId = required("AIRTABLE_BASE_ID");
  const table = encodeURIComponent(process.env.AIRTABLE_PRODUCTS_TABLE ?? "Products");
  const endpoint = existingId
    ? `https://api.airtable.com/v0/${baseId}/${table}/${existingId}`
    : `https://api.airtable.com/v0/${baseId}/${table}`;
  const response = await fetch(endpoint, {
    method: existingId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${required("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  const payload = (await response.json()) as { id?: string; error?: { message?: string } };
  if (!response.ok || !payload.id) {
    throw new Error(`Row ${index + 1} (${name}): ${payload.error?.message ?? `Airtable error ${response.status}`}`);
  }

  return { name, category, airtableId: payload.id, imageUrl: uploadedImages[0] ?? null, overwritten: Boolean(existingId) };
}

// Patches whatever a Products row is genuinely missing (no real image, no
// price) by re-scraping the row's own "Product URL" — the same source used
// at import time, but re-run on demand from the storefront product page so
// gaps left by a partial import get filled in without a manual Sync pass.
// Looks the record up itself by productId (rather than trusting a
// client-supplied URL) so a caller can't point this at an arbitrary URL and
// have it written into someone else's record. Old Price is only ever filled
// as a side effect of a genuinely missing Price/image — never triggered on
// its own, since null there is usually just "no discount", not "empty".
export async function fillMissingProductFields(productId: string): Promise<{
  imageUrl: string | null;
  images: string[];
  priceNow: number | null;
  priceOld: number | null;
} | null> {
  const { getAllStoreProductRecords } = await import("@/lib/airtable-products");
  const records = await getAllStoreProductRecords();
  const record = records.find((entry) => entry.product.id === productId);
  const productUrl = record?.product.productUrl;
  if (!record || !productUrl) return null;

  const { product, airtableRecordId } = record;
  const needsImage = product.imageUrl === null || /^https:\/\/picsum\.photos\//i.test(product.imageUrl);
  const needsPrice = product.priceNow === null;
  if (!needsImage && !needsPrice) return null;

  const scraped = await scrapeProductPage(productUrl);

  const fields: Record<string, unknown> = {};
  let imageUrl = product.imageUrl;
  let images = product.images ?? [];
  if (needsImage && scraped.images.length > 0) {
    const uploaded = await Promise.all(
      scraped.images.slice(0, 8).map((url, index) => uploadImage(url, productId, index))
    );
    imageUrl = uploaded[0] ?? imageUrl;
    images = uploaded;
    fields["Image URL"] = uploaded[0] ?? "";
    fields["Product Images"] = uploaded.join(", ");
  }

  let priceNow = product.priceNow;
  let priceOld = product.priceOld;
  if (needsPrice && scraped.priceNow !== null) {
    priceNow = scraped.priceNow;
    fields.Price = scraped.priceNow;
    if (scraped.priceOld !== null && scraped.priceOld > scraped.priceNow) {
      priceOld = scraped.priceOld;
      fields["Old Price"] = scraped.priceOld;
    }
  }

  if (Object.keys(fields).length === 0) return null;

  const baseId = required("AIRTABLE_BASE_ID");
  const table = encodeURIComponent(process.env.AIRTABLE_PRODUCTS_TABLE ?? "Products");
  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${table}/${airtableRecordId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${required("AIRTABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) return null;

  return { imageUrl, images, priceNow, priceOld };
}
