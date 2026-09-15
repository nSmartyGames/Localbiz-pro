"use client";

import { useEffect, useState } from "react";

type DashboardSection = "sync" | "mail" | "orders";

// Sentinel column-mapping value: the column is dropped entirely on import,
// unlike "" (unmapped), which folds the column's value into Description.
const IGNORE_COLUMN = "__ignore__";

type MailItem = {
  id?: string;
  subject?: string;
  from?: string;
  to?: string | string[];
  last_event?: string;
  created_at?: string;
};

function foldDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value: string): string {
  return foldDiacritics(value.toLowerCase()).replace(/[^a-z0-9]/g, "");
}

function tokenize(value: string): string[] {
  return foldDiacritics(value.toLowerCase()).split(/[^a-z0-9]+/).filter(Boolean);
}

// Core Products fields the import route always understands, kept available
// as mapping targets even when Airtable's own schema (fields actually
// present on existing records) hasn't seen them yet.
const CORE_PRODUCT_FIELDS = [
  "Name",
  "Size",
  "Description",
  "Price",
  "Old Price",
  "Discount",
  "Currency",
  "Product URL",
  "Image URL",
  "Product Images",
];

// Saved column -> field mappings only (never product data), so the next
// JSON export from the same source can skip re-mapping every column by
// hand. Stored client-side (localStorage) since it's per-admin convenience,
// not shared state.
type ColumnTemplate = {
  name: string;
  columns: string[]; // raw column labels, kept only for display
  mapping: Record<string, string>; // normalizeKey(column) -> target field / IGNORE_COLUMN / ""
};

const TEMPLATES_STORAGE_KEY = "lavive-sync-column-templates";

function loadTemplates(): ColumnTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TEMPLATES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as ColumnTemplate[]) : [];
  } catch {
    return [];
  }
}

function saveTemplates(templates: ColumnTemplate[]) {
  try {
    window.localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
  } catch {
    // localStorage unavailable (private mode, quota) — saving the template
    // just silently doesn't persist past this session.
  }
}

// Unlike templates, this DOES hold the actual uploaded rows — there's no
// other way to "reopen" a file the browser can't re-read from disk. Kept to
// the last 5, client-side only.
type RecentFile = { name: string; rows: Record<string, unknown>[]; savedAt: number };

const RECENT_FILES_STORAGE_KEY = "lavive-sync-recent-files";
const RECENT_FILES_LIMIT = 5;

function loadRecentFiles(): RecentFile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENT_FILES_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentFile[]) : [];
  } catch {
    return [];
  }
}

function saveRecentFilesList(files: RecentFile[]) {
  try {
    window.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(files));
  } catch {
    // localStorage unavailable or quota exceeded (product JSON can be
    // large) — the recent-files list just won't persist past this session.
  }
}

// A template matches a newly uploaded file only when every column it was
// saved with is still present (by normalized name) — a partial overlap
// isn't a strong enough signal that this is the same export source. Ties
// (more than one full match) go to whichever template covers more columns.
function findMatchingTemplate(templates: ColumnTemplate[], fileColumns: string[]): ColumnTemplate | null {
  const normalizedFileColumns = new Set(fileColumns.map(normalizeKey));
  let best: ColumnTemplate | null = null;
  for (const template of templates) {
    const templateKeys = Object.keys(template.mapping);
    if (templateKeys.length === 0) continue;
    const fullyCovered = templateKeys.every((key) => normalizedFileColumns.has(key));
    if (fullyCovered && (!best || templateKeys.length > Object.keys(best.mapping).length)) {
      best = template;
    }
  }
  return best;
}

// No auto-guessing by design — every column defaults to "" (unmapped,
// folded into Description) unless a saved template already covers it by
// its normalized name. The admin assigns the rest by hand.
function applyTemplateMapping(columns: string[], template: ColumnTemplate | null): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const column of columns) {
    mapping[column] = template?.mapping[normalizeKey(column)] ?? "";
  }
  return mapping;
}

// Known header spellings for the product-URL column across import sources
// ("URL Produs", "URL", "URL Product"), matched by normalizeKey so casing
// and spacing don't matter. Only applied when the admin clicks the button —
// kept opt-in to stay consistent with the no-auto-guessing rule above.
const PRODUCT_URL_ALIASES = new Set(["urlprodus", "url", "urlproduct"].map(normalizeKey));

function applyProductUrlAliasMapping(columns: string[], mapping: Record<string, string>): Record<string, string> {
  const next = { ...mapping };
  for (const column of columns) {
    if (PRODUCT_URL_ALIASES.has(normalizeKey(column))) {
      next[column] = "Product URL";
    }
  }
  return next;
}

const CATEGORY_STOPWORDS = new Set(["de", "si", "cu", "la", "din", "pentru", "si", "pe", "the", "and", "for"]);

// Guesses a row's category from its product name by scoring every known
// category's own significant words (e.g. "crema-de-fata" -> "crema","fata")
// against the words in the name. Picks the highest-scoring category with at
// least one match; ties/no-match fall back to "" (Ignoră), same as an
// unrecognized row would.
function guessCategoryForName(name: string, categories: string[]): string {
  const nameTokens = new Set(tokenize(name));
  let best = "";
  let bestScore = 0;
  for (const category of categories) {
    const tokens = tokenize(category).filter((token) => token.length > 2 && !CATEGORY_STOPWORDS.has(token));
    const score = tokens.filter((token) => nameTokens.has(token)).length;
    if (score > bestScore) {
      bestScore = score;
      best = category;
    }
  }
  return best;
}

// Row keys aren't guaranteed casing, so "Name"/"name"/"Product URL" etc. are
// all matched case-insensitively rather than by exact key lookup.
function pickRowValue(row: Record<string, unknown>, ...keys: string[]): string {
  const wanted = new Set(keys.map((key) => key.toLowerCase()));
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(key.trim().toLowerCase()) && typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isEmptyValue(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

// "https://www.douglas.ro/ro/p/..." -> "douglas" — just the site's own
// name, not the full domain, for a compact open-in-new-tab button label.
function getSiteLabel(url: string): string {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    const parts = hostname.split(".");
    return parts.length >= 2 ? parts[parts.length - 2] : hostname;
  } catch {
    return url;
  }
}

// No scrape fills this anymore — Price/Description/Image are entered by
// hand (or, for images, dragged in). `images` is the only field left: the
// row's gallery, built up one drag-and-drop at a time.
type ScrapedInfo = { images: string[] };

// Douglas returns a deceptive Akamai 400 to any plain fetch/curl regardless
// of headers, and notino.ro shows a Cloudflare "managed challenge"
// interstitial — only a real browser gets past either. douglas-scraper/
// server.js runs that real browser locally (next to whichever machine the
// admin has the dashboard open on) and exposes it over a small local HTTP
// bridge; this is just the client for it.
const LOCAL_BRIDGE_URL = "http://localhost:5391";
const LOCAL_BRIDGE_HOSTS = /(^|\.)(douglas\.ro|notino\.ro|olx\.ro)$/i;

function needsLocalBridge(url: string): boolean {
  try {
    return LOCAL_BRIDGE_HOSTS.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

// Defense in depth against a scraper (server-side bridge or the plain-fetch
// route) returning the product page's own URL as an "image" — e.g. a PDP
// template defaulting og:image/JSON-LD image to the canonical URL when no
// real photo is set for that SKU. Never show/import that as a photo.
function dropSelfReferentialImages(images: string[], sourceUrl: string): string[] {
  return images.filter((src) => src !== sourceUrl);
}

type DouglasScrapeResult = {
  name: string | null;
  description: string | null;
  priceNow: number | null;
  priceOld: number | null;
  size: string | null;
  images: string[];
};

// Response shape of POST /dpstore/api/scrape-product (see
// web/lib/import-product.ts's scrapeProductPage) — a plain-fetch, no-browser
// scrape that works for most sites but not ones with bot protection (e.g.
// douglas.ro), unlike the Douglas-only bridge above.
type ScrapeProductResult = {
  name: string | null;
  priceNow: number | null;
  priceOld: number | null;
  description: string | null;
  size?: string | null;
  images: string[];
};

// Mirrors the OverwriteMode in lib/import-product.ts — how a row flagged as
// "already exists" should be re-applied onto its existing Airtable record.
// The Sync page only ever offers a choice between "all" (default) and
// "allWithoutImages" (the one "fără imagini" checkbox) — "images"-only
// overwrite stays supported server-side but isn't surfaced in this UI.
type OverwriteMode = "images" | "allWithoutImages" | "all";

function DashboardEmailForm() {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Actualizare LaVive");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSending(true);
    setStatus(null);
    try {
      const response = await fetch("/dpstore/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, message }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Emailul nu a putut fi trimis.");
      setStatus(`Email trimis către ${to}.`);
      setTo("");
      setMessage("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Eroare la trimiterea emailului.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border border-[#e6e3e5] bg-white p-6">
      <div className="grid gap-4">
        <input required type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="Destinatar" className="border border-[#d8d0c5] px-4 py-3" />
        <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subiect" className="border border-[#d8d0c5] px-4 py-3" />
        <textarea required rows={7} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mesaj" className="border border-[#d8d0c5] px-4 py-3" />
      </div>
      <div className="mt-4 flex items-center gap-4">
        <button disabled={isSending} className="store-button store-button-primary">
          {isSending ? "Se trimite..." : "Trimite email"}
        </button>
        {status && <p className="text-sm text-[#301934]">{status}</p>}
      </div>
    </form>
  );
}

export default function DashboardClient({
  initialSection = "sync",
}: {
  initialSection?: DashboardSection;
}) {
  const [section, setSection] = useState<DashboardSection>(initialSection);
  const [categories, setCategories] = useState<string[]>([]);
  const [airtableFields, setAirtableFields] = useState<string[]>([]);
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [existingUrls, setExistingUrls] = useState<Set<string>>(new Set());
  const [existingDescriptionsByName, setExistingDescriptionsByName] = useState<Record<string, string>>({});
  const [existingDescriptionsByUrl, setExistingDescriptionsByUrl] = useState<Record<string, string>>({});
  const [existingImagesByName, setExistingImagesByName] = useState<Record<string, string>>({});
  const [existingImagesByUrl, setExistingImagesByUrl] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [pasteHasHeader, setPasteHasHeader] = useState(true);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [rowCategories, setRowCategories] = useState<string[]>([]);
  const [includedRows, setIncludedRows] = useState<boolean[]>([]);
  const [isExistingRow, setIsExistingRow] = useState<boolean[]>([]);
  const [overwriteModes, setOverwriteModes] = useState<Record<number, OverwriteMode>>({});
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<ColumnTemplate[]>([]);
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importDuplicates, setImportDuplicates] = useState<string[]>([]);
  const [scrapedInfo, setScrapedInfo] = useState<Record<number, ScrapedInfo>>({});
  const [scrapedDescriptions, setScrapedDescriptions] = useState<Record<number, string>>({});
  const [scrapedPrices, setScrapedPrices] = useState<Record<number, { now: number | null; old: number | null }>>({});
  const [scrapedSizes, setScrapedSizes] = useState<Record<number, string>>({});
  const [scrapedNames, setScrapedNames] = useState<Record<number, string>>({});
  const [scrapeStatus, setScrapeStatus] = useState<Record<number, string>>({});
  // null = the "Salvează șablon" input isn't open; a string = the draft name
  // typed into it. window.prompt() isn't available in every host (some
  // embedded/automated browsers reject it outright), so this button opens an
  // inline input instead of calling window.prompt().
  const [templateNameDraft, setTemplateNameDraft] = useState<string | null>(null);
  const [newProductUrl, setNewProductUrl] = useState("");
  const [isAddingProductByUrl, setIsAddingProductByUrl] = useState(false);
  const [addProductUrlError, setAddProductUrlError] = useState<string | null>(null);
  const [emails, setEmails] = useState<MailItem[]>([]);
  const [mailStatus, setMailStatus] = useState<string | null>(null);

  const columns = Array.from(new Set(parsedRows.flatMap((row) => Object.keys(row)))).filter(
    (key) => key.trim().toLowerCase() !== "category"
  );

  // Loaded after mount, not as the useState initializer above — the
  // initializer runs during SSR too (window undefined -> []), and running it
  // again during the client's hydration render with real localStorage data
  // produced a markup mismatch (recentFiles.length > 0 renders a block server
  // never emitted), tripping React's hydration-failed warning.
  useEffect(() => {
    setTemplates(loadTemplates());
    setRecentFiles(loadRecentFiles());
  }, []);

  useEffect(() => {
    if (section !== "sync") return;
    (async () => {
      try {
        const response = await fetch("/dpstore/api/sync-products", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Categoriile nu au putut fi încărcate.");
        setCategories((payload.categories ?? []) as string[]);
        setAirtableFields(Array.from(new Set([...CORE_PRODUCT_FIELDS, ...((payload.fields ?? []) as string[])])));
        setExistingNames(new Set((payload.existingNames ?? []) as string[]));
        setExistingUrls(new Set((payload.existingUrls ?? []) as string[]));
        setExistingDescriptionsByName((payload.existingDescriptionsByName ?? {}) as Record<string, string>);
        setExistingDescriptionsByUrl((payload.existingDescriptionsByUrl ?? {}) as Record<string, string>);
        setExistingImagesByName((payload.existingImagesByName ?? {}) as Record<string, string>);
        setExistingImagesByUrl((payload.existingImagesByUrl ?? {}) as Record<string, string>);
      } catch (error) {
        setImportStatus(error instanceof Error ? error.message : "Eroare la încărcarea categoriilor.");
      }
    })();
  }, [section]);

  function resetImportState(name: string | null) {
    setFileError(null);
    setImportStatus(null);
    setImportErrors([]);
    setImportDuplicates([]);
    setParsedRows([]);
    setRowCategories([]);
    setIncludedRows([]);
    setIsExistingRow([]);
    setOverwriteModes({});
    setColumnMapping({});
    setAppliedTemplateName(null);
    setScrapedPrices({});
    setScrapedNames({});
    setScrapeStatus({});
    setFileName(name);
  }

  // Parses CSV text (with support for quoted fields containing commas,
  // newlines, or escaped quotes) into the same Record<string, unknown>[]
  // shape a JSON array of products used to produce, so applyParsedRows and
  // recordRecentFile need no changes.
  function parseDelimitedRows(text: string, delimiter: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let field = "";
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
        continue;
      }
      if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(field);
        field = "";
      } else if (char === "\n" || char === "\r") {
        if (char === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
    if (field.length > 0 || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
  }

  function parseCsvRows(text: string): Record<string, unknown>[] {
    const nonEmptyRows = parseDelimitedRows(text, ",");
    if (nonEmptyRows.length < 2) return [];
    const headers = nonEmptyRows[0].map((header) => header.trim());
    return nonEmptyRows.slice(1).map((cells) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (header) record[header] = cells[index] ?? "";
      });
      return record;
    });
  }

  // Excel/Sheets copy-paste is tab-separated; falls back to comma if no tabs
  // are present (e.g. a CSV snippet pasted instead of a real spreadsheet range).
  function detectPasteDelimiter(text: string): string {
    return text.includes("\t") ? "\t" : ",";
  }

  // A bare domain like "notino.ro" (no slashes, no spaces) — used to spot a
  // site/path pair split across two lines in a vertical listing paste.
  const BARE_DOMAIN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)+$/i;

  // A block's 2nd and 3rd fields (right after the leading index number) are
  // collapsed into one absolute-URL field when they look like a domain
  // followed by a path — e.g. "notino.ro" / "/afnan/9-pm.../" becomes
  // "https://notino.ro/afnan/9-pm.../" — since that pair is really one
  // product field (its page URL), not two.
  function mergeSitePathFields(fields: string[]): string[] {
    if (fields.length < 3) return fields;
    const [index, site, path, ...rest] = fields;
    if (BARE_DOMAIN.test(site) && path.startsWith("/")) {
      return [index, `https://${site}${path}`, ...rest];
    }
    return fields;
  }

  // Some listing sites (e.g. a product grid copy-pasted from Notino) paste
  // as one value per line, in repeating fixed-size blocks, each block
  // starting with that product's position number ("1", "2", "3", ...,
  // ascending or descending) followed by a bare domain line ("notino.ro").
  // Blocks are anchored on the domain line rather than the leading number,
  // because several other fields in the same block (price, review count)
  // are ALSO plain integers — anchoring on "any numeric line" mistakes
  // those for block boundaries too. A domain string is a much rarer shape
  // to collide with. Without this, the generic delimiter parser below
  // treats every line as its own single-column row instead of reshaping
  // the fields into one row per product.
  function parseVerticalRecordRows(text: string): Record<string, unknown>[] | null {
    const lines = text
      .split(/\r\n|\r|\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length < 4) return null;

    const domainPositions = lines.reduce<number[]>((positions, line, i) => {
      if (BARE_DOMAIN.test(line)) positions.push(i);
      return positions;
    }, []);
    if (domainPositions.length === 0) return null;
    if (domainPositions[0] < 1 || !/^\d+$/.test(lines[domainPositions[0] - 1])) return null;

    const blockStarts = domainPositions.map((position) => position - 1);
    let blockSize: number;
    if (blockStarts.length === 1) {
      blockSize = lines.length - blockStarts[0];
    } else {
      blockSize = blockStarts[1] - blockStarts[0];
      if (blockSize < 3) return null;
      const step = Number(lines[blockStarts[1]]) - Number(lines[blockStarts[0]]);
      if (Math.abs(step) !== 1) return null;
      for (let i = 1; i < blockStarts.length; i++) {
        if (blockStarts[i] - blockStarts[i - 1] !== blockSize) return null;
        if (!/^\d+$/.test(lines[blockStarts[i]])) return null;
        if (Number(lines[blockStarts[i]]) - Number(lines[blockStarts[i - 1]]) !== step) return null;
      }
    }

    const usableStarts = blockStarts.filter((position) => position + blockSize <= lines.length);
    const mergedBlocks = usableStarts.map((position) => mergeSitePathFields(lines.slice(position, position + blockSize)));
    const columnCount = Math.max(...mergedBlocks.map((block) => block.length));
    const headers = Array.from({ length: columnCount }, (_, index) => `Col${index + 1}`);
    return mergedBlocks.map((fields) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = fields[index] ?? "";
      });
      return record;
    });
  }

  // Mirrors parseCsvRows's output shape, but for arbitrary Excel/Sheets
  // paste content: delimiter is auto-detected (tab, falling back to comma),
  // and a header row is optional — when absent (per the caller's hasHeader
  // choice), columns are auto-named Col1, Col2, ... in column order.
  //
  // Whether a header row is used is always an explicit choice (the "Prima
  // linie conține anteturi" checkbox), never guessed: a heuristic guess
  // (e.g. "numeric first cell means data") silently swallows a real data
  // row as a header whenever that row happens to be all text, shifting
  // every row after it out of alignment with its intended column.
  //
  // columnCount is taken across ALL rows, not just the header row, so a
  // ragged paste (a data row longer than the header row) still gets every
  // column an auto-named header instead of silently dropping the overflow.
  function parsePastedRows(text: string, hasHeader: boolean): Record<string, unknown>[] {
    const verticalRows = parseVerticalRecordRows(text);
    if (verticalRows) return verticalRows;

    const nonEmptyRows = parseDelimitedRows(text, detectPasteDelimiter(text));
    if (nonEmptyRows.length === 0) return [];
    const columnCount = Math.max(...nonEmptyRows.map((cells) => cells.length));
    const headerRow = hasHeader ? nonEmptyRows[0] : [];
    const headers = Array.from({ length: columnCount }, (_, index) => headerRow[index]?.trim() || `Col${index + 1}`);
    const dataRows = hasHeader ? nonEmptyRows.slice(1) : nonEmptyRows;
    return dataRows.map((cells) => {
      const record: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        record[header] = cells[index] ?? "";
      });
      return record;
    });
  }

  // Shared by a fresh file upload and reopening one of the last 5 recent
  // files — both end up with the same set of rows to run through the same
  // existing/template/category setup.
  function applyParsedRows(typedRows: Record<string, unknown>[]) {
    const columns = Array.from(new Set(typedRows.flatMap((row) => Object.keys(row)))).filter(
      (key) => key.trim().toLowerCase() !== "category"
    );
    // Checked against Airtable BEFORE anything else — an existing row
    // gets flagged and left unchecked by default, so it's never scraped
    // or re-imported unless the user explicitly checks it and picks an
    // overwrite mode.
    const existingFlags = typedRows.map((row) => {
      const nameKey = getProductName(row).trim().toLowerCase();
      const url = getProductUrl(row);
      return Boolean((nameKey && existingNames.has(nameKey)) || (url && existingUrls.has(url)));
    });

    const matchedTemplate = findMatchingTemplate(templates, columns);

    // An existing row's current Description is fed into the (now editable)
    // "Descriere" column up front, so re-importing a product shows what's
    // already in Airtable instead of a blank cell — the admin edits it in
    // place rather than retyping it from scratch.
    const initialDescriptions: Record<number, string> = {};
    // Same idea as the description prefill above, but for the gallery
    // column: an existing product's current "Product Images" is split back
    // into the same scrapedInfo[index].images shape the drag-drop/paste-URL
    // gallery already uses, so re-importing shows (and lets the admin edit)
    // what's already in Airtable instead of an empty drop zone.
    const initialImages: Record<number, ScrapedInfo> = {};
    typedRows.forEach((row, index) => {
      if (!existingFlags[index]) return;
      const nameKey = getProductName(row).trim().toLowerCase();
      const url = getProductUrl(row);
      const existingDescription =
        (nameKey && existingDescriptionsByName[nameKey]) || (url && existingDescriptionsByUrl[url]) || "";
      if (existingDescription) initialDescriptions[index] = existingDescription;

      const existingImages =
        (nameKey && existingImagesByName[nameKey]) || (url && existingImagesByUrl[url]) || "";
      const images = existingImages
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      if (images.length) initialImages[index] = { images };
    });

    setParsedRows(typedRows);
    setRowCategories(typedRows.map((row) => guessCategoryForName(getProductName(row), categories)));
    setIncludedRows(existingFlags.map((isExisting) => !isExisting));
    setIsExistingRow(existingFlags);
    setColumnMapping(applyTemplateMapping(columns, matchedTemplate));
    setAppliedTemplateName(matchedTemplate?.name ?? null);
    setScrapedInfo(initialImages);
    setScrapedDescriptions(initialDescriptions);
  }

  function recordRecentFile(name: string, rows: Record<string, unknown>[]) {
    setRecentFiles((current) => {
      const next = [{ name, rows, savedAt: Date.now() }, ...current.filter((entry) => entry.name !== name)].slice(0, RECENT_FILES_LIMIT);
      saveRecentFilesList(next);
      return next;
    });
  }

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    resetImportState(file?.name ?? null);
    if (!file) return;
    try {
      const typedRows = parseCsvRows(await file.text());
      if (typedRows.length === 0) throw new Error("CSV-ul trebuie să conțină cel puțin un produs.");
      applyParsedRows(typedRows);
      recordRecentFile(file.name, typedRows);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Fișierul nu este un CSV valid.");
    }
  }

  function handleReopenRecentFile(entry: RecentFile) {
    resetImportState(entry.name);
    applyParsedRows(entry.rows);
  }

  function handlePasteImport() {
    resetImportState("Lipit din clipboard");
    try {
      const typedRows = parsePastedRows(pasteText, pasteHasHeader);
      if (typedRows.length === 0) throw new Error("Conținutul lipit trebuie să conțină cel puțin un rând.");
      applyParsedRows(typedRows);
      recordRecentFile("Lipit din clipboard", typedRows);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Conținutul lipit nu a putut fi interpretat.");
    }
  }

  function setRowCategory(index: number, category: string) {
    setRowCategories((current) => current.map((value, i) => (i === index ? category : value)));
  }

  function setColumnTarget(column: string, target: string) {
    setColumnMapping((current) => ({ ...current, [column]: target }));
  }

  function handleAutoMapProductUrl() {
    setColumnMapping((current) => applyProductUrlAliasMapping(columns, current));
  }

  function openSaveTemplateDialog() {
    const suggestedName = fileName?.replace(/\.json$/i, "") ?? "";
    setTemplateNameDraft(appliedTemplateName ?? suggestedName);
  }

  // Saves only the column -> field mapping (never the uploaded rows), keyed
  // by normalized column name, so it also matches the same export with
  // minor header casing/spacing differences next time.
  function handleSaveTemplate(rawName: string) {
    const name = rawName.trim();
    if (!name) return;
    setTemplateNameDraft(null);

    const mapping: Record<string, string> = {};
    for (const column of columns) {
      mapping[normalizeKey(column)] = columnMapping[column] ?? "";
    }
    const template: ColumnTemplate = { name, columns, mapping };

    setTemplates((current) => {
      const next = [...current.filter((existingTemplate) => existingTemplate.name !== name), template];
      saveTemplates(next);
      return next;
    });
    setAppliedTemplateName(name);
    setImportStatus(`Șablon „${name}” salvat.`);
  }

  function toggleRow(index: number) {
    setIncludedRows((current) => current.map((value, i) => (i === index ? !value : value)));
  }

  function toggleAllRows(checked: boolean) {
    setIncludedRows((current) => current.map(() => checked));
  }

  // Matches handleImport's own eligibility check (checked AND categorized).
  // Using plain "checked" count here made the button say e.g. "Importă 10
  // produse" and then immediately block with "bifează și asignează o
  // categorie" once clicked, when none of those 10 actually had a category
  // — confusing since the rows genuinely were checked.
  const checkedCount = includedRows.filter(Boolean).length;
  const readyCount = includedRows.filter((included, index) => included && rowCategories[index]).length;

  function formatCell(value: unknown): string {
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  const IMAGE_URL_PATTERN = /^https?:\/\/\S+\.(?:jpe?g|png|webp|gif|avif)(?:\?\S*)?$/i;

  // A raw JSON column full of gallery URLs is unreadable as text — shown as
  // a row of thumbnails instead, regardless of whether that column is
  // mapped to any Airtable field.
  function extractImageUrls(value: unknown): string[] {
    const candidates = Array.isArray(value) ? value : typeof value === "string" ? value.split(",").map((part) => part.trim()) : [];
    return candidates.filter((entry): entry is string => typeof entry === "string" && IMAGE_URL_PATTERN.test(entry));
  }

  // Turns one JSON row into an Airtable-shaped row using the header
  // dropdowns' column -> field mapping. A field mapped from exactly one
  // column takes that column's raw value. Everything else — unmapped
  // columns, and any field mapped from more than one column (ambiguous,
  // so there's no single right value) — is folded into Description as
  // "Column: value" lines, same as an unmapped column would be.
  function buildFinalRow(row: Record<string, unknown>): Record<string, unknown> {
    const targetCounts: Record<string, number> = {};
    for (const column of columns) {
      const target = columnMapping[column];
      if (target && target !== "Description" && target !== IGNORE_COLUMN) {
        targetCounts[target] = (targetCounts[target] ?? 0) + 1;
      }
    }

    const fields: Record<string, unknown> = {};
    const descriptionParts: string[] = [];
    for (const column of columns) {
      const value = row[column];
      if (value === null || value === undefined || value === "") continue;
      const target = columnMapping[column];
      if (target === IGNORE_COLUMN) {
        continue;
      } else if (target === "Description") {
        descriptionParts.push(formatCell(value));
      } else if (target && targetCounts[target] === 1) {
        // Mapping a column to "Discount" means it holds the product's full
        // (pre-discount) price, not a percentage — write it to Old Price so
        // the import route derives the actual Discount % from Price vs. it.
        fields[target === "Discount" ? "Old Price" : target] = value;
      } else {
        descriptionParts.push(`${column}: ${formatCell(value)}`);
      }
    }
    if (descriptionParts.length) {
      fields.Description = [fields.Description, ...descriptionParts].filter(Boolean).join("\n");
    }
    return fields;
  }

  // With no auto-guessing, a row isn't actually importable until the admin
  // has manually mapped at least a Name column and picked a category — the
  // "fără imagini" overwrite checkbox only makes sense to show once that's
  // true, otherwise there's nothing valid to overwrite with yet.
  function isRowValidForImport(index: number): boolean {
    const fields = buildFinalRow(parsedRows[index]);
    const name = isEmptyValue(fields.Name) ? scrapedNames[index] : fields.Name;
    return !isEmptyValue(name) && Boolean(rowCategories[index]);
  }

  function getProductUrl(row: Record<string, unknown>): string {
    const mappedColumn = columns.find((column) => columnMapping[column] === "Product URL");
    if (mappedColumn) {
      const value = row[mappedColumn];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return pickRowValue(row, "product url", "producturl", "url");
  }

  // Mirrors getProductUrl above — a mapped "Name" column takes priority over
  // the naive raw-key guess. Without this, a JSON export whose name column
  // isn't literally called "name" (e.g. "Titlu", "Nume produs") never
  // matched an existing Airtable product by name at all, silently skipping
  // the Description/gallery prefill and the overwrite flow.
  function getProductName(row: Record<string, unknown>): string {
    const mappedColumn = columns.find((column) => columnMapping[column] === "Name");
    if (mappedColumn) {
      const value = row[mappedColumn];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return pickRowValue(row, "name");
  }

  // Just opens the product page for the admin to read off values by hand —
  // no scraping. Price/Description/Image are filled in manually (or, for
  // images, dragged in from the opened tab).
  function openProductPage(url: string) {
    window.open(url, "_blank", "noopener,noreferrer");
  }

  // Fills in whatever a row is currently missing — Name, Price/Old Price,
  // Description, and gallery images — straight from the product's own page,
  // for ANY site the row's Product URL points to. Sites in
  // LOCAL_BRIDGE_HOSTS (Douglas, Notino) go through the local headless-Chrome
  // bridge (see douglas-scraper/server.js), since a plain fetch there just
  // gets a bot-check block page; every other site uses the
  // serverless-friendly /api/scrape-product route. Writes into the same
  // scrapedInfo/scrapedDescriptions/scrapedPrices/scrapedNames state the
  // drag-drop gallery and buildImportRow's blank-filling already read from,
  // so a column the admin (or an earlier CSV/paste) already mapped a real
  // value into is never overwritten — only actually-blank fields get filled.
  async function handleScrapeRow(index: number) {
    const url = getProductUrl(parsedRows[index]);
    if (!url) return;
    const useLocalBridge = needsLocalBridge(url);

    setScrapeStatus((current) => ({ ...current, [index]: "loading" }));
    try {
      const response = await fetch(useLocalBridge ? `${LOCAL_BRIDGE_URL}/scrape` : "/dpstore/api/scrape-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as (ScrapeProductResult | DouglasScrapeResult) & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Scraping a eșuat.");

      if (payload.name?.trim()) {
        setScrapedNames((current) => ({ ...current, [index]: payload.name!.trim() }));
      }
      const cleanImages = dropSelfReferentialImages(payload.images ?? [], url);
      if (cleanImages.length) {
        setScrapedInfo((current) => {
          const existingImages = current[index]?.images ?? [];
          const merged = Array.from(new Set([...existingImages, ...cleanImages]));
          return { ...current, [index]: { images: merged } };
        });
      }
      if (payload.description) {
        setScrapedDescriptions((current) => ({ ...current, [index]: payload.description ?? current[index] ?? "" }));
      }
      if (payload.priceNow !== null || payload.priceOld !== null) {
        setScrapedPrices((current) => ({ ...current, [index]: { now: payload.priceNow, old: payload.priceOld } }));
      }
      if (payload.size) {
        setScrapedSizes((current) => ({ ...current, [index]: payload.size as string }));
      }
      setScrapeStatus((current) => ({ ...current, [index]: "ok" }));
    } catch (error) {
      const fallback = useLocalBridge
        ? "Bridge-ul local nu răspunde (rulează `npm run bridge` în douglas-scraper)."
        : "Eroare la scraping.";
      const message = error instanceof Error && error.message !== "Failed to fetch" ? error.message : fallback;
      setScrapeStatus((current) => ({ ...current, [index]: message }));
    }
  }

  // Standalone "paste a URL, get a new row" flow — unlike handleScrapeRow
  // above (which only fills in gaps on a row a CSV/JSON import already
  // produced), this creates the row itself from nothing but the pasted URL.
  // A LOCAL_BRIDGE_HOSTS URL goes through the same local bridge as
  // handleScrapeRow (plain fetch gets a bot-check block page there, which
  // has no product name/price/JSON-LD to read) — everything else uses the
  // serverless-friendly (no headless browser) /api/scrape-product route.
  async function handleAddProductFromUrl() {
    const url = newProductUrl.trim();
    if (!/^https?:\/\//i.test(url)) {
      setAddProductUrlError("Introdu un URL valid (http/https).");
      return;
    }

    setIsAddingProductByUrl(true);
    setAddProductUrlError(null);
    const useLocalBridge = needsLocalBridge(url);
    try {
      const response = await fetch(useLocalBridge ? `${LOCAL_BRIDGE_URL}/scrape` : "/dpstore/api/scrape-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const payload = (await response.json()) as (ScrapeProductResult | DouglasScrapeResult) & { error?: string };
      if (!response.ok) {
        throw new Error(
          payload.error ?? (useLocalBridge ? "Bridge-ul local nu răspunde (rulează `npm run bridge` în douglas-scraper)." : "Scraping a eșuat.")
        );
      }

      const name = (payload.name ?? "").trim();
      const newRow: Record<string, unknown> = { Name: name, "Product URL": url };
      const nextIndex = parsedRows.length;
      const nameKey = name.toLowerCase();
      const isExisting = Boolean((nameKey && existingNames.has(nameKey)) || existingUrls.has(url));

      // "Name" and "Product URL" are columns this flow creates itself (not
      // an arbitrary CSV header), so mapping each straight to its
      // same-named field isn't a guess the way auto-mapping an unknown
      // column would be — it's just wiring the row up to import correctly.
      // Only set when unmapped so a pre-existing CSV's own choice for these
      // columns (if any) is never overridden.
      setColumnMapping((current) => ({
        ...current,
        Name: current.Name ?? "Name",
        "Product URL": current["Product URL"] ?? "Product URL",
      }));
      setParsedRows((current) => [...current, newRow]);
      setRowCategories((current) => [...current, guessCategoryForName(name, categories)]);
      setIncludedRows((current) => [...current, !isExisting]);
      setIsExistingRow((current) => [...current, isExisting]);
      if (!fileName) setFileName("Produse adăugate manual");

      if (payload.description) {
        setScrapedDescriptions((current) => ({ ...current, [nextIndex]: payload.description as string }));
      }
      const cleanImages = dropSelfReferentialImages(payload.images ?? [], url);
      if (cleanImages.length) {
        setScrapedInfo((current) => ({ ...current, [nextIndex]: { images: cleanImages } }));
      }
      if (payload.priceNow !== null || payload.priceOld !== null) {
        setScrapedPrices((current) => ({
          ...current,
          [nextIndex]: { now: payload.priceNow ?? null, old: payload.priceOld ?? null },
        }));
      }
      if (payload.size) {
        setScrapedSizes((current) => ({ ...current, [nextIndex]: payload.size as string }));
      }
      setNewProductUrl("");
    } catch (error) {
      // A thrown Error above (bad response, admin check, etc.) already
      // carries a useful message. A bare fetch() rejection — e.g. the local
      // bridge not running — is also "instanceof Error" but with a generic
      // browser message ("Failed to fetch"), so point at the bridge instead
      // when that's the endpoint that was in play.
      const fallback = useLocalBridge
        ? "Bridge-ul local nu răspunde (rulează `npm run bridge` în douglas-scraper)."
        : "Eroare la scraping.";
      setAddProductUrlError(error instanceof Error && error.message !== "Failed to fetch" ? error.message : fallback);
    } finally {
      setIsAddingProductByUrl(false);
    }
  }

  // Drop target for "drag an image from the opened product tab" — reads
  // whatever URL form the browser gave the drop (uri-list, falling back to
  // plain text) and appends it to the row's gallery. Feeds the same
  // scrapedInfo[index].images that buildImportRow already uses to fill
  // Image URL / Product Images on import.
  function addDroppedImage(index: number, url: string) {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return;
    setScrapedInfo((current) => {
      const images = current[index]?.images ?? [];
      if (images.includes(trimmed)) return current;
      return { ...current, [index]: { images: [...images, trimmed] } };
    });
  }

  function handleImageDrop(event: React.DragEvent<HTMLElement>, index: number) {
    event.preventDefault();
    const url = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
    addDroppedImage(index, url);
  }

  // Paste-URL fallback for the image cell — same target as drag-and-drop
  // (scrapedInfo[index].images), for admins who'd rather copy/paste a URL
  // than drag an <img> from another tab.
  function handleImageUrlPaste(index: number, event: React.ClipboardEvent<HTMLInputElement>) {
    const url = event.clipboardData.getData("text/plain");
    if (!/^https?:\/\//i.test(url.trim())) return;
    event.preventDefault();
    addDroppedImage(index, url);
    event.currentTarget.value = "";
  }

  function handleImageUrlSubmit(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addDroppedImage(index, event.currentTarget.value);
    event.currentTarget.value = "";
  }

  function removeDroppedImage(index: number, url: string) {
    setScrapedInfo((current) => ({
      ...current,
      [index]: { images: (current[index]?.images ?? []).filter((image) => image !== url) },
    }));
  }

  // Builds the Airtable-shaped row for one product, filling in whatever a
  // dragged/pasted-in image supplied for fields the JSON's own columns
  // didn't carry. Fields with no source data at all (no mapped column, or
  // the row's own value is empty — not every product has a price) are
  // simply left out, not treated as an error to fix before importing.
  function buildImportRow(index: number): Record<string, unknown> {
    const fields = buildFinalRow(parsedRows[index]);
    const info = scrapedInfo[index];

    if (isEmptyValue(fields.Name) && scrapedNames[index]) {
      fields.Name = scrapedNames[index];
    }

    if (scrapedDescriptions[index]) {
      fields.Description = [scrapedDescriptions[index], fields.Description].filter(Boolean).join("\n\n");
    }

    if (info?.images?.length) {
      // The row's gallery (dragged/pasted-in, or prefilled from the existing
      // Airtable record) always wins for "Product Images" — it was silently
      // ignored before whenever a mapped JSON column already had SOME value
      // for "Image URL", even a single-image one, so the multi-image gallery
      // never reached Airtable. The import route re-fetches each URL to
      // re-host it, but this way the thumbnails shown in the table are
      // exactly what gets imported. "Image URL" is the featured image and is
      // never duplicated into "Product Images" — the gallery only carries
      // the extra shots.
      const featuredImage = isEmptyValue(fields["Image URL"]) ? info.images[0] : fields["Image URL"];
      fields["Image URL"] = featuredImage;
      const galleryImages = info.images.filter((src) => src !== featuredImage);
      fields["Product Images"] = galleryImages.join(", ");
    }

    // Scraped price only fills in what the mapped columns left blank — a
    // column the admin explicitly mapped to Price/Old Price still wins.
    const prices = scrapedPrices[index];
    if (prices?.now !== null && prices?.now !== undefined) fields.Price = fields.Price ?? prices.now;
    if (prices?.old !== null && prices?.old !== undefined) fields["Old Price"] = fields["Old Price"] ?? prices.old;
    if (scrapedSizes[index]) fields.Size = fields.Size ?? scrapedSizes[index];

    fields.Category = rowCategories[index];
    if (isExistingRow[index]) {
      fields.__overwrite = overwriteModes[index] ?? "all";
    }
    return fields;
  }

  async function handleImport() {
    // Rows left on "Ignoră" (no category assigned) are skipped rather than
    // blocking the whole import — that's the point of defaulting to Ignoră.
    const selectedIndexes = includedRows.flatMap((included, index) =>
      included && rowCategories[index] ? [index] : []
    );
    if (selectedIndexes.length === 0) {
      setImportStatus("Bifează cel puțin un produs și asignează-i o categorie.");
      return;
    }
    setIsImporting(true);
    setImportStatus(null);
    setImportErrors([]);
    setImportDuplicates([]);

    try {
      const rows = selectedIndexes.map((index) => buildImportRow(index));
      const response = await fetch("/dpstore/api/sync-products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Importul a eșuat.");

      // Rows the server found already existing (that the dashboard itself
      // didn't already know about — e.g. imported since this page loaded)
      // get flagged for overwrite now, so pressing Importă again forces
      // them through instead of hitting the same rejection forever.
      const duplicateRowIndexes: number[] = (payload.duplicateIndexes ?? []).map((i: number) => selectedIndexes[i]);
      if (duplicateRowIndexes.length > 0) {
        setIsExistingRow((current) => current.map((value, i) => (duplicateRowIndexes.includes(i) ? true : value)));
        setOverwriteModes((current) => {
          const next = { ...current };
          for (const rowIndex of duplicateRowIndexes) next[rowIndex] = next[rowIndex] ?? "all";
          return next;
        });
      }

      const overwritePrompt = duplicateRowIndexes.length > 0 ? " Apasă din nou Importă pentru a le suprascrie." : "";
      setImportStatus(
        (payload.overwritten
          ? `${payload.imported} produse importate (${payload.overwritten} suprascrise).`
          : `${payload.imported} produse importate.`) + overwritePrompt
      );
      setImportErrors(payload.errors ?? []);
      setImportDuplicates(payload.duplicates ?? []);
    } catch (error) {
      setImportStatus(error instanceof Error ? error.message : "Eroare la import.");
    } finally {
      setIsImporting(false);
    }
  }

  async function fetchMail() {
    setMailStatus(null);
    try {
      const response = await fetch("/dpstore/api/mail", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Emailurile nu au putut fi încărcate.");
      setEmails(payload.emails ?? []);
    } catch (error) {
      setMailStatus(error instanceof Error ? error.message : "Eroare la încărcarea emailurilor.");
    }
  }

  useEffect(() => {
    if (section !== "mail") return;
    const initialFetch = window.setTimeout(() => void fetchMail(), 0);
    const interval = window.setInterval(() => void fetchMail(), 15 * 60 * 1000);
    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(interval);
    };
  }, [section]);

  return (
    <main className="min-h-screen bg-[#f8f7f6] text-[#242124]">
      <div className="mx-auto flex max-w-6xl flex-col md:flex-row">
        <aside className="w-full border-b border-[#e6e3e5] bg-[#301934] p-5 text-white md:min-h-screen md:w-56 md:border-b-0 md:border-r">
          <div className="mb-8 text-xs font-bold uppercase tracking-[0.2em] text-[#d4b477]">LaVive Admin</div>
          <nav className="grid gap-2">
            {(["sync", "mail", "orders"] as DashboardSection[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSection(item)}
                className={`px-4 py-3 text-left text-sm font-medium uppercase tracking-wide transition ${section === item ? "bg-white text-[#301934]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}
              >
                {item === "sync" ? "Sync" : item === "mail" ? "Mail" : "Orders"}
              </button>
            ))}
            <a
              href="/dpstore/store"
              className="px-4 py-3 text-left text-sm font-medium uppercase tracking-wide text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Store
            </a>
          </nav>
        </aside>

        <section className="min-w-0 flex-1 px-6 py-10 md:px-10">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9a783f]">Dashboard</p>
          <h1 className="mt-3 text-4xl font-medium">Administrare magazin</h1>

          {section === "sync" && (
            <div className="mt-10 grid min-w-0 gap-6">
              <div className="min-w-0 border border-[#e6e3e5] bg-white p-6">
                <h2 className="text-xl font-medium text-[#301934]">Import produse din CSV</h2>
                <p className="mt-2 text-sm text-[#6b676b]">
                  Încarcă un fișier CSV (prima linie = antet, restul = produse). Pentru fiecare coloană,
                  alege sub numele ei câmpul din Products căruia îi corespunde — coloanele lăsate pe
                  &quot;— la Descriere —&quot; (sau mapate la un câmp ales de mai multe coloane) se adaugă
                  la Description, iar cele puse pe &quot;— Ignoră —&quot; nu se importă deloc. Bifează
                  produsele de importat și alege categoria fiecăruia.
                </p>
                <input
                  type="file"
                  accept="text/csv,.csv"
                  onChange={(event) => void handleFileChange(event)}
                  className="mt-5 block w-full text-sm md:max-w-md"
                />
                {fileName && !fileError && <p className="mt-3 text-sm text-[#6b676b]">{fileName}</p>}
                {fileError && <p className="mt-3 text-sm text-[#b23b3b]">{fileError}</p>}
                {recentFiles.length > 0 && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-[#6b676b]">Fișiere recente:</span>
                    {recentFiles.map((entry) => (
                      <button
                        key={entry.name}
                        type="button"
                        onClick={() => handleReopenRecentFile(entry)}
                        className="inline-flex items-center rounded border border-[#d8d0c5] bg-white px-2 py-1 text-xs text-[#301934] hover:bg-[#f8f7f6]"
                      >
                        {entry.name}
                      </button>
                    ))}
                  </div>
                )}
                {appliedTemplateName && (
                  <p className="mt-3 text-sm text-[#9a783f]">Șablon aplicat automat: „{appliedTemplateName}”.</p>
                )}

                <div className="mt-6 border-t border-[#e6e3e5] pt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#301934]">
                    Lipește coloane din Excel
                  </h3>
                  <p className="mt-1 text-xs text-[#6b676b]">
                    Copiază un interval de celule din Excel/Google Sheets și lipește-l mai jos. Dacă
                    prima linie conține anteturi, sunt folosite ca nume de coloane; altfel coloanele
                    sunt numite automat Col1, Col2, ... .
                  </p>
                  <textarea
                    rows={6}
                    value={pasteText}
                    onChange={(event) => setPasteText(event.target.value)}
                    placeholder="Lipește aici conținutul copiat din Excel"
                    className="mt-3 w-full border border-[#d8d0c5] px-3 py-2 text-sm md:max-w-2xl"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-xs text-[#6b676b]">
                      <input
                        type="checkbox"
                        checked={pasteHasHeader}
                        onChange={(event) => setPasteHasHeader(event.target.checked)}
                      />
                      Prima linie conține anteturi
                    </label>
                    <button
                      type="button"
                      onClick={handlePasteImport}
                      disabled={!pasteText.trim()}
                      className="border border-[#301934] bg-[#301934] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-[#241226] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Adaugă în tabel
                    </button>
                  </div>
                </div>

                <div className="mt-6 border-t border-[#e6e3e5] pt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#301934]">
                    Adaugă produs după URL
                  </h3>
                  <p className="mt-1 text-xs text-[#6b676b]">
                    Lipește URL-ul paginii unui produs — numele, prețul, descrierea și imaginile se
                    extrag automat, iar produsul e adăugat ca rând nou în tabel, pregătit de import.
                    Funcționează doar pe site-uri care nu blochează accesul automat; pentru douglas.ro
                    adaugă mai întâi rândul (Name + Product URL) și folosește butonul „Scrapează produs”
                    de la rândul respectiv.
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      type="url"
                      value={newProductUrl}
                      onChange={(event) => setNewProductUrl(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        void handleAddProductFromUrl();
                      }}
                      placeholder="https://exemplu.ro/produs/..."
                      className="w-full max-w-md border border-[#d8d0c5] px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => void handleAddProductFromUrl()}
                      disabled={isAddingProductByUrl || !newProductUrl.trim()}
                      className="inline-flex items-center rounded border border-black bg-yellow-400 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#301934] hover:bg-yellow-300 disabled:opacity-50"
                    >
                      {isAddingProductByUrl ? "Se scanează..." : "Scrapează și adaugă"}
                    </button>
                  </div>
                  {addProductUrlError && <p className="mt-2 text-xs text-[#b23b3b]">{addProductUrlError}</p>}
                </div>

                {parsedRows.length > 0 && (
                  <>
                    {templateNameDraft === null ? (
                      <button
                        type="button"
                        onClick={openSaveTemplateDialog}
                        className="mt-4 inline-flex items-center rounded border border-[#d8d0c5] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#301934] hover:bg-[#f8f7f6]"
                      >
                        Salvează șablon (mapare coloane)
                      </button>
                    ) : (
                      <span className="mt-4 inline-flex items-center gap-2">
                        <input
                          type="text"
                          autoFocus
                          value={templateNameDraft}
                          onChange={(event) => setTemplateNameDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleSaveTemplate(templateNameDraft);
                            } else if (event.key === "Escape") {
                              setTemplateNameDraft(null);
                            }
                          }}
                          placeholder="Nume șablon"
                          className="border border-[#d8d0c5] px-3 py-2 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveTemplate(templateNameDraft)}
                          className="inline-flex items-center rounded border border-black bg-yellow-400 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#301934] hover:bg-yellow-300"
                        >
                          Salvează
                        </button>
                        <button
                          type="button"
                          onClick={() => setTemplateNameDraft(null)}
                          className="inline-flex items-center rounded border border-[#d8d0c5] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#301934] hover:bg-[#f8f7f6]"
                        >
                          Anulează
                        </button>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleAutoMapProductUrl}
                      className="ml-2 mt-4 inline-flex items-center rounded border border-black bg-yellow-400 p-[3px] text-xs font-semibold uppercase tracking-wide text-[#301934] hover:bg-yellow-300"
                    >
                      Mapează URL Produs
                    </button>
                    <div className="mt-6 overflow-x-auto border border-[#e6e3e5]">
                      <table className="min-w-full border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#f8f7f6] text-left uppercase tracking-wide text-[#6b676b]">
                            <th className="border-b border-[#e6e3e5] px-3 py-2 font-semibold">
                              <div className="grid gap-1">
                                <span>Import</span>
                                <input
                                  type="checkbox"
                                  checked={includedRows.length > 0 && includedRows.every(Boolean)}
                                  onChange={(event) => toggleAllRows(event.target.checked)}
                                />
                              </div>
                            </th>
                            <th className="border-b border-[#e6e3e5] px-3 py-2 font-semibold">Categorie</th>
                            {columns.map((column) => (
                              <th key={column} className="whitespace-nowrap border-b border-[#e6e3e5] px-3 py-2 font-semibold align-top">
                                <div className="grid gap-1">
                                  <span>{column}</span>
                                  <select
                                    value={columnMapping[column] ?? ""}
                                    onChange={(event) => setColumnTarget(column, event.target.value)}
                                    className="w-full border border-[#d8d0c5] bg-white px-1 py-1 text-[10px] font-normal normal-case tracking-normal text-[#301934]"
                                  >
                                    <option value="">— la Descriere —</option>
                                    <option value={IGNORE_COLUMN}>— Ignoră (nu se importă) —</option>
                                    {airtableFields.map((field) => (
                                      <option key={field} value={field}>
                                        {field}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </th>
                            ))}
                            <th className="border-b border-[#e6e3e5] px-3 py-2 font-semibold">Verificare</th>
                            <th className="border-b border-[#e6e3e5] px-3 py-2 font-semibold">Imagine (trage &amp; plasează)</th>
                            <th className="border-b border-[#e6e3e5] px-3 py-2 font-semibold">Descriere</th>
                          </tr>
                        </thead>
                        <tbody>
                          {parsedRows.map((row, index) => (
                            <tr
                              key={index}
                              className={`border-b border-[#e6e3e5] last:border-b-0 ${includedRows[index] ? "" : "opacity-50"}`}
                            >
                              <td className={`px-3 py-2 align-top ${isExistingRow[index] ? "bg-yellow-200" : ""}`}>
                                <div className="grid gap-1">
                                  <input
                                    type="checkbox"
                                    checked={includedRows[index] ?? false}
                                    onChange={() => toggleRow(index)}
                                    className={isExistingRow[index] ? "accent-yellow-500" : undefined}
                                  />
                                  {isExistingRow[index] && includedRows[index] && isRowValidForImport(index) && (
                                    <label className="flex items-center gap-1 whitespace-nowrap text-[10px] text-[#301934]">
                                      <input
                                        type="checkbox"
                                        checked={overwriteModes[index] === "allWithoutImages"}
                                        onChange={(event) =>
                                          setOverwriteModes((current) => ({
                                            ...current,
                                            [index]: event.target.checked ? "allWithoutImages" : "all",
                                          }))
                                        }
                                      />
                                      fără imagini
                                    </label>
                                  )}
                                  {isExistingRow[index] && includedRows[index] && !isRowValidForImport(index) && (
                                    <span className="text-[10px] text-[#b23b3b]">mapează Name + categorie</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-3 py-2 align-top">
                                <select
                                  value={rowCategories[index] ?? ""}
                                  onChange={(event) => setRowCategory(index, event.target.value)}
                                  disabled={!includedRows[index]}
                                  className="border border-[#d8d0c5] bg-white px-2 py-1 text-xs"
                                >
                                  <option value="">Ignoră (nu se importă)</option>
                                  {categories.map((category) => (
                                    <option key={category} value={category}>
                                      {category}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              {columns.map((column) => {
                                const value = row[column];
                                // No header-text guessing — only the column's own assigned
                                // mapping (manual, or from a matched template) decides this.
                                const isProductUrlColumn = columnMapping[column] === "Product URL";
                                const productUrlValue = isProductUrlColumn && typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
                                const images = productUrlValue ? [] : extractImageUrls(value);
                                return (
                                  <td key={column} className="whitespace-nowrap px-3 py-2 align-top">
                                    {isProductUrlColumn ? (
                                      <div className="flex items-center gap-1">
                                        <input
                                          type="text"
                                          defaultValue={typeof value === "string" ? value : ""}
                                          onKeyDown={(event) => {
                                            if (event.key !== "Enter") return;
                                            const url = event.currentTarget.value.trim();
                                            setParsedRows((current) =>
                                              current.map((r, i) => (i === index ? { ...r, [column]: url } : r))
                                            );
                                          }}
                                          disabled={!includedRows[index]}
                                          placeholder="https://..."
                                          className="w-40 border border-[#d8d0c5] bg-white px-2 py-1 text-[10px] text-[#3d393d]"
                                        />
                                        {productUrlValue && (
                                          <button
                                            type="button"
                                            onClick={() => openProductPage(productUrlValue)}
                                            className="inline-flex w-fit items-center rounded border border-[#d8d0c5] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#301934] hover:bg-[#f8f7f6]"
                                          >
                                            {getSiteLabel(productUrlValue)}
                                          </button>
                                        )}
                                      </div>
                                    ) : images.length > 0 ? (
                                      <div className="flex gap-1">
                                        {images.slice(0, 4).map((src) => (
                                          // eslint-disable-next-line @next/next/no-img-element -- arbitrary scraped domains, not worth allowlisting for an admin preview
                                          <img key={src} src={src} alt="" className="h-8 w-8 rounded border border-[#e6e3e5] object-cover" />
                                        ))}
                                      </div>
                                    ) : (
                                      formatCell(value)
                                    )}
                                  </td>
                                );
                              })}
                              <td className="whitespace-nowrap px-3 py-2 align-top">
                                {getProductUrl(row) ? (
                                  <div className="grid gap-1">
                                    <button
                                      type="button"
                                      onClick={() => openProductPage(getProductUrl(row))}
                                      className="inline-flex w-fit items-center rounded border border-[#d8d0c5] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#301934] hover:bg-[#f8f7f6]"
                                    >
                                      {getSiteLabel(getProductUrl(row))}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void handleScrapeRow(index)}
                                      disabled={scrapeStatus[index] === "loading"}
                                      className="inline-flex w-fit items-center rounded border border-black bg-yellow-400 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#301934] hover:bg-yellow-300 disabled:opacity-50"
                                    >
                                      {scrapeStatus[index] === "loading" ? "Se scanează..." : "Scrapează produs"}
                                    </button>
                                    {scrapedNames[index] && (
                                      <span className="max-w-[9rem] truncate text-[10px] text-[#301934]" title={scrapedNames[index]}>
                                        Nume: {scrapedNames[index]}
                                      </span>
                                    )}
                                    {((scrapedPrices[index]?.now ?? scrapedPrices[index]?.old) != null || scrapedSizes[index]) && (
                                      <div className="grid gap-1">
                                        <label className="flex items-center gap-1 text-[10px] text-[#301934]">
                                          Preț:
                                          <input
                                            type="number"
                                            value={scrapedPrices[index]?.now ?? ""}
                                            onChange={(event) =>
                                              setScrapedPrices((current) => ({
                                                ...current,
                                                [index]: {
                                                  now: event.target.value === "" ? null : Number(event.target.value),
                                                  old: current[index]?.old ?? null,
                                                },
                                              }))
                                            }
                                            disabled={!includedRows[index]}
                                            className="w-16 border border-[#d8d0c5] bg-white px-1 py-0.5 text-[10px] text-[#3d393d]"
                                          />
                                          RON
                                        </label>
                                        <label className="flex items-center gap-1 text-[10px] text-[#301934]">
                                          PRP:
                                          <input
                                            type="number"
                                            value={scrapedPrices[index]?.old ?? ""}
                                            onChange={(event) =>
                                              setScrapedPrices((current) => ({
                                                ...current,
                                                [index]: {
                                                  now: current[index]?.now ?? null,
                                                  old: event.target.value === "" ? null : Number(event.target.value),
                                                },
                                              }))
                                            }
                                            disabled={!includedRows[index]}
                                            className="w-16 border border-[#d8d0c5] bg-white px-1 py-0.5 text-[10px] text-[#3d393d]"
                                          />
                                          RON
                                        </label>
                                        <label className="flex items-center gap-1 text-[10px] text-[#301934]">
                                          Cantitate:
                                          <input
                                            type="text"
                                            value={scrapedSizes[index] ?? ""}
                                            onChange={(event) =>
                                              setScrapedSizes((current) => ({ ...current, [index]: event.target.value }))
                                            }
                                            disabled={!includedRows[index]}
                                            placeholder="ex. 50 ml"
                                            className="w-16 border border-[#d8d0c5] bg-white px-1 py-0.5 text-[10px] text-[#3d393d]"
                                          />
                                        </label>
                                      </div>
                                    )}
                                    {scrapeStatus[index] && scrapeStatus[index] !== "loading" && scrapeStatus[index] !== "ok" && (
                                      <span className="max-w-[9rem] text-[10px] text-[#b23b3b]">{scrapeStatus[index]}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-[#6b676b]">—</span>
                                )}
                              </td>
                              <td
                                className="px-3 py-2 align-top"
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={(event) => handleImageDrop(event, index)}
                              >
                                <div className="flex min-h-10 w-28 flex-wrap gap-1 border border-dashed border-[#d8d0c5] p-1">
                                  {(scrapedInfo[index]?.images ?? []).length > 0 ? (
                                    (scrapedInfo[index]?.images ?? []).map((src) => (
                                      <div key={src} className="group relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary dragged-in domains, not worth allowlisting for an admin preview */}
                                        <img src={src} alt="" className="h-8 w-8 rounded border border-[#e6e3e5] object-cover" />
                                        <button
                                          type="button"
                                          onClick={() => removeDroppedImage(index, src)}
                                          className="absolute -right-1 -top-1 hidden h-4 w-4 items-center justify-center rounded-full bg-[#b23b3b] text-[10px] leading-none text-white group-hover:flex"
                                        >
                                          ×
                                        </button>
                                      </div>
                                    ))
                                  ) : (
                                    <span className="self-center text-[10px] text-[#6b676b]">trage o imagine aici</span>
                                  )}
                                </div>
                                <input
                                  type="text"
                                  placeholder="sau lipește URL imagine"
                                  className="mt-1 w-28 rounded border border-[#d8d0c5] px-1 py-0.5 text-[10px]"
                                  onPaste={(event) => handleImageUrlPaste(index, event)}
                                  onKeyDown={(event) => handleImageUrlSubmit(index, event)}
                                />
                              </td>
                              <td className="max-w-xs px-3 py-2 align-top">
                                <textarea
                                  rows={3}
                                  value={scrapedDescriptions[index] ?? ""}
                                  onChange={(event) =>
                                    setScrapedDescriptions((current) => ({ ...current, [index]: event.target.value }))
                                  }
                                  disabled={!includedRows[index]}
                                  className="w-56 border border-[#d8d0c5] bg-white px-2 py-1 text-xs text-[#3d393d]"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleImport()}
                      disabled={isImporting || readyCount === 0}
                      className="store-button store-button-primary mt-6"
                    >
                      {isImporting ? "Se importă..." : `Importă ${readyCount} produse`}
                    </button>
                    {checkedCount > readyCount && (
                      <p className="mt-2 text-xs text-[#9a783f]">
                        {checkedCount - readyCount} produs(e) bifat(e) nu au categorie asignată — nu vor fi importate.
                      </p>
                    )}
                  </>
                )}
                {importStatus && <p className="mt-4 text-sm text-[#301934]">{importStatus}</p>}
                {importDuplicates.length > 0 && (
                  <ul className="mt-3 grid gap-1 text-xs text-[#9a783f]">
                    {importDuplicates.map((duplicate, index) => (
                      <li key={`${duplicate}-${index}`}>⚠ {duplicate}</li>
                    ))}
                  </ul>
                )}
                {importErrors.length > 0 && (
                  <ul className="mt-3 grid gap-1 text-xs text-[#b23b3b]">
                    {importErrors.map((error, index) => (
                      <li key={`${error}-${index}`}>{error}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {section === "mail" && (
            <div className="mt-10 grid gap-8">
              <div>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-medium text-[#301934]">Ultimele 10 emailuri Resend</h2>
                  <span className="text-xs text-[#6b676b]">Actualizare automată la 15 minute</span>
                </div>
                {mailStatus && <p className="mt-4 text-sm text-[#b23b3b]">{mailStatus}</p>}
                <div className="mt-4 divide-y divide-[#e6e3e5] border-y border-[#e6e3e5] bg-white">
                  {emails.length === 0 ? <p className="p-5 text-sm text-[#6b676b]">Nu există emailuri afișate.</p> : emails.map((email) => {
                    const recipients = Array.isArray(email.to) ? email.to.join(", ") : email.to;
                    const createdAt = email.created_at
                      ? new Date(email.created_at).toLocaleString("ro-RO")
                      : "Dată necunoscută";

                    return (
                      <div key={email.id ?? `${email.subject}-${email.created_at}`} className="p-5">
                        <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between md:gap-4">
                          <p className="font-medium">{email.subject ?? "Fără subiect"}</p>
                          <p className="shrink-0 text-xs text-[#6b676b]">{createdAt}</p>
                        </div>
                        <p className="mt-1 text-sm text-[#6b676b]">{email.from ?? "Expeditor necunoscut"}</p>
                        {recipients && <p className="mt-1 text-sm text-[#6b676b]">Către: {recipients}</p>}
                        {email.last_event && <p className="mt-1 text-xs uppercase tracking-wide text-[#9a783f]">{email.last_event}</p>}
                      </div>
                    );
                  })}
                </div>
              </div>
              <DashboardEmailForm />
            </div>
          )}

          {section === "orders" && (
            <div className="mt-10 border border-[#e6e3e5] bg-white p-6">
              <h2 className="text-xl font-medium text-[#301934]">Orders</h2>
              <p className="mt-2 text-sm text-[#6b676b]">Comenzile vor fi afișate aici după conectarea sursei de plăți.</p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
