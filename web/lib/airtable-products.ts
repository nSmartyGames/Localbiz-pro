import type { CategorySlug, Product } from "@/lib/products";
import { getDigitalProducts } from "@/lib/digital-products";

function numericField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/[^\d.,-]/g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

const storeCategorySlugs: CategorySlug[] = [
  "crema-de-fata",
  "crema-de-noapte",
  "uleiuri-tratamente",
  "seturi-ingrijire",
  "suplimente-vitamine",
  "casa-decor",
  "gradina-exterior",
  "fashion-men-shoes",
];

type ProductsTableFields = {
  Name?: string;
  Category?: string;
  Size?: string;
  Description?: string;
  Price?: unknown;
  "Old Price"?: unknown;
  Discount?: unknown;
  Currency?: string;
  "Image URL"?: string;
  "Product Images"?: string;
  "Product URL"?: string;
  "Product Id"?: string;
};

export type StoreProductRecord = { product: Product; airtableRecordId: string };

// Single source of truth for storefront category listings: every product
// rendered under /store/d and /store/c comes from the Airtable Products
// table (Category filtered to the store CategorySlug values).
export async function getAllStoreProductRecords(): Promise<StoreProductRecord[]> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return [];

  const table = encodeURIComponent(process.env.AIRTABLE_PRODUCTS_TABLE ?? "Products");
  const records: Array<{ id: string; fields: ProductsTableFields }> = [];
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      next: { revalidate: 60 },
    });
    if (!response.ok) break;
    const payload = (await response.json()) as {
      records?: Array<{ id: string; fields: ProductsTableFields }>;
      offset?: string;
    };
    records.push(...(payload.records ?? []));
    offset = payload.offset;
  } while (offset);

  return records
    .filter(
      (record): record is { id: string; fields: ProductsTableFields & { Name: string; Category: CategorySlug } } =>
        typeof record.fields?.Name === "string" &&
        storeCategorySlugs.includes(record.fields.Category as CategorySlug)
    )
    .map((record) => {
      const fields = record.fields;
      const id = fields["Product Id"]?.trim() || record.id;
      const priceNow = numericField(fields.Price);
      const discount = numericField(fields.Discount);
      const priceOld =
        numericField(fields["Old Price"]) ??
        (priceNow !== null && discount !== null && discount > 0 && discount < 100
          ? priceNow / (1 - discount / 100)
          : null);
      const productUrl =
        typeof fields["Product URL"] === "string" && /^https?:\/\//i.test(fields["Product URL"])
          ? fields["Product URL"]
          : null;
      const imageUrl =
        typeof fields["Image URL"] === "string" && /^https?:\/\//i.test(fields["Image URL"])
          ? fields["Image URL"]
          : `https://picsum.photos/seed/${id}/600/600`;
      const images =
        typeof fields["Product Images"] === "string"
          ? fields["Product Images"]
              .split(",")
              .map((entry) => entry.trim())
              .filter((entry) => /^https?:\/\//i.test(entry))
          : [];

      const product: Product = {
        id,
        name: fields.Name,
        category: fields.Category,
        size: fields.Size ?? "",
        priceNow,
        priceOld,
        pricePerMl: null,
        currency: fields.Currency === "USD" ? "USD" : "RON",
        description: fields.Description ?? "",
        imageUrl,
        isReal: Boolean(productUrl),
        productUrl,
      };
      return { product: images.length ? { ...product, images } : product, airtableRecordId: record.id };
    });
}

export async function getAllStoreProducts(): Promise<Product[]> {
  const airtable = (await getAllStoreProductRecords()).map((record) => record.product);
  // Static digital downloads (e.g. weight-loss trackers) are appended so the
  // storefront, cart, checkout and success page share one merged catalog.
  return [...airtable, ...getDigitalProducts()];
}

// Category values and column names for the dashboard's Sync page — both
// read straight from the Products table (rather than hardcoded) so new
// categories or columns show up without a code change. Field names are the
// union of keys actually present across records, since Airtable's record
// API doesn't expose table schema.
export async function getProductsSchema(): Promise<{ categories: string[]; fields: string[] }> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return { categories: [], fields: [] };

  const table = encodeURIComponent(process.env.AIRTABLE_PRODUCTS_TABLE ?? "Products");
  const categories = new Set<string>();
  const fields = new Set<string>();
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
    url.searchParams.set("pageSize", "100");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!response.ok) break;
    const payload = (await response.json()) as {
      records?: Array<{ fields?: Record<string, unknown> }>;
      offset?: string;
    };
    for (const record of payload.records ?? []) {
      const recordFields = record.fields ?? {};
      if (typeof recordFields.Category === "string") categories.add(recordFields.Category);
      for (const key of Object.keys(recordFields)) {
        if (key !== "Category") fields.add(key);
      }
    }
    offset = payload.offset;
  } while (offset);

  return { categories: Array.from(categories).sort(), fields: Array.from(fields).sort() };
}

export type ExistingProductIndex = {
  byName: Map<string, string>;
  byUrl: Map<string, string>;
  descriptionByName: Map<string, string>;
  descriptionByUrl: Map<string, string>;
  imagesByName: Map<string, string>;
  imagesByUrl: Map<string, string>;
};

// Existence check for the Sync page's duplicate-import guard — id-aware
// (unlike a plain name/URL set) so a matched row can be overwritten via
// PATCH instead of only ever being skipped. Pulls only Name/Product
// URL/Description/Product Images (not full records) across every category,
// since a duplicate could land in any category, not just the storefront
// ones. The description/images maps let the Sync page prefill an existing
// product's current Description and image gallery when a row matches it,
// so re-importing doesn't blank either one out.
export async function getExistingProductIndex(): Promise<ExistingProductIndex> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const byName = new Map<string, string>();
  const byUrl = new Map<string, string>();
  const descriptionByName = new Map<string, string>();
  const descriptionByUrl = new Map<string, string>();
  const imagesByName = new Map<string, string>();
  const imagesByUrl = new Map<string, string>();
  if (!apiKey || !baseId) return { byName, byUrl, descriptionByName, descriptionByUrl, imagesByName, imagesByUrl };

  const table = encodeURIComponent(process.env.AIRTABLE_PRODUCTS_TABLE ?? "Products");
  let offset: string | undefined;

  do {
    const url = new URL(`https://api.airtable.com/v0/${baseId}/${table}`);
    url.searchParams.set("pageSize", "100");
    url.searchParams.append("fields[]", "Name");
    url.searchParams.append("fields[]", "Product URL");
    url.searchParams.append("fields[]", "Description");
    url.searchParams.append("fields[]", "Product Images");
    if (offset) url.searchParams.set("offset", offset);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
    if (!response.ok) break;
    const payload = (await response.json()) as {
      records?: Array<{
        id: string;
        fields?: { Name?: string; "Product URL"?: string; Description?: string; "Product Images"?: string };
      }>;
      offset?: string;
    };
    for (const record of payload.records ?? []) {
      const fields = record.fields ?? {};
      if (typeof fields.Name === "string" && fields.Name.trim()) {
        const key = fields.Name.trim().toLowerCase();
        byName.set(key, record.id);
        if (typeof fields.Description === "string" && fields.Description) descriptionByName.set(key, fields.Description);
        if (typeof fields["Product Images"] === "string" && fields["Product Images"]) {
          imagesByName.set(key, fields["Product Images"]);
        }
      }
      if (typeof fields["Product URL"] === "string" && fields["Product URL"]) {
        byUrl.set(fields["Product URL"], record.id);
        if (typeof fields.Description === "string" && fields.Description) descriptionByUrl.set(fields["Product URL"], fields.Description);
        if (typeof fields["Product Images"] === "string" && fields["Product Images"]) {
          imagesByUrl.set(fields["Product URL"], fields["Product Images"]);
        }
      }
    }
    offset = payload.offset;
  } while (offset);

  return { byName, byUrl, descriptionByName, descriptionByUrl, imagesByName, imagesByUrl };
}

// Writes a refreshed Product back onto its Airtable record. Used by the
// dashboard's "Sync categorie"/"Sync hero" actions so refreshed data
// actually lands in the single source of truth instead of a local file.
export async function writeStoreProduct(airtableRecordId: string, product: Product): Promise<void> {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  if (!apiKey || !baseId) return;

  const table = encodeURIComponent(process.env.AIRTABLE_PRODUCTS_TABLE ?? "Products");
  const discount =
    product.priceNow !== null && product.priceOld !== null && product.priceOld > product.priceNow
      ? Math.round(((product.priceOld - product.priceNow) / product.priceOld) * 100)
      : null;

  const fields: Record<string, unknown> = {
    Name: product.name,
    Size: product.size,
    Description: product.description,
    Price: product.priceNow,
    "Old Price": product.priceOld,
    Discount: discount,
    Currency: product.currency ?? "RON",
    "Image URL": product.imageUrl,
    "Product URL": product.productUrl,
    ...(product.images?.length ? { "Product Images": product.images.join(", ") } : {}),
  };

  const response = await fetch(`https://api.airtable.com/v0/${baseId}/${table}/${airtableRecordId}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (!response.ok) {
    throw new Error(`Airtable write failed for ${airtableRecordId}: ${response.status} ${await response.text()}`);
  }
}
