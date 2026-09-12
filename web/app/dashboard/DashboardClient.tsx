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

// Mirrors the OverwriteMode in lib/import-product.ts — how a row flagged as
// "already exists" should be re-applied onto its existing Airtable record.
// The Sync page only ever offers a choice between "all" (default) and
// "allWithoutImages" (the one "fără imagini" checkbox) — "images"-only
// overwrite stays supported server-side but isn't surfaced in this UI.
type OverwriteMode = "images" | "allWithoutImages" | "all";

// The fields the Sync page will pause and ask a human about when neither
// the JSON columns nor the product-page scrape can supply them.
type MissingFieldKey = "Price" | "Description" | "Image URL";

const MISSING_FIELD_LABELS: Record<MissingFieldKey, string> = {
  Price: "Preț (RON)",
  Description: "Descriere",
  "Image URL": "URL imagine",
};

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
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [rowCategories, setRowCategories] = useState<string[]>([]);
  const [includedRows, setIncludedRows] = useState<boolean[]>([]);
  const [isExistingRow, setIsExistingRow] = useState<boolean[]>([]);
  const [overwriteModes, setOverwriteModes] = useState<Record<number, OverwriteMode>>({});
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [templates, setTemplates] = useState<ColumnTemplate[]>(() => loadTemplates());
  const [appliedTemplateName, setAppliedTemplateName] = useState<string | null>(null);
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>(() => loadRecentFiles());
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importDuplicates, setImportDuplicates] = useState<string[]>([]);
  const [scrapedInfo, setScrapedInfo] = useState<Record<number, ScrapedInfo>>({});
  const [manualFieldValues, setManualFieldValues] = useState<Record<number, Partial<Record<MissingFieldKey, string>>>>({});
  const [pendingFields, setPendingFields] = useState<Record<number, MissingFieldKey[]>>({});
  const [scrapedDescriptions, setScrapedDescriptions] = useState<Record<number, string>>({});
  const [emails, setEmails] = useState<MailItem[]>([]);
  const [mailStatus, setMailStatus] = useState<string | null>(null);

  const columns = Array.from(new Set(parsedRows.flatMap((row) => Object.keys(row)))).filter(
    (key) => key.trim().toLowerCase() !== "category"
  );

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
    setFileName(name);
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
    setManualFieldValues({});
    setPendingFields({});
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
      const rows = JSON.parse(await file.text());
      if (!Array.isArray(rows) || rows.length === 0) throw new Error("JSON-ul trebuie să fie un array de produse.");
      const typedRows = rows as Record<string, unknown>[];
      applyParsedRows(typedRows);
      recordRecentFile(file.name, typedRows);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : "Fișierul nu este un JSON valid.");
    }
  }

  function handleReopenRecentFile(entry: RecentFile) {
    resetImportState(entry.name);
    applyParsedRows(entry.rows);
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

  // Saves only the column -> field mapping (never the uploaded rows), keyed
  // by normalized column name, so it also matches the same export with
  // minor header casing/spacing differences next time.
  function handleSaveTemplate() {
    const suggestedName = fileName?.replace(/\.json$/i, "") ?? "";
    const name = window.prompt("Nume șablon:", appliedTemplateName ?? suggestedName)?.trim();
    if (!name) return;

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
    return !isEmptyValue(fields.Name) && Boolean(rowCategories[index]);
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

  // Checks one row for the fields the Sync page cares about (Price,
  // Description, Image URL), given the already-mapped JSON columns plus
  // whatever the product-page scrape and/or a manual entry supplied. For a
  // row overwriting an existing product, only the fields that overwrite
  // mode actually touches are checked — "images" doesn't care about
  // Price/Description, "allWithoutImages" doesn't care about Image URL.
  function detectMissingFields(
    index: number,
    info: ScrapedInfo | undefined,
    manual: Partial<Record<MissingFieldKey, string>>
  ): MissingFieldKey[] {
    const row = parsedRows[index];
    const fields = buildFinalRow(row);
    const mode = isExistingRow[index] ? overwriteModes[index] ?? "all" : undefined;
    const missing: MissingFieldKey[] = [];

    if (mode !== "images") {
      const hasPrice = !isEmptyValue(fields.Price) || Boolean(manual.Price);
      if (!hasPrice) missing.push("Price");

      const hasDescription = !isEmptyValue(fields.Description) || Boolean(manual.Description) || Boolean(scrapedDescriptions[index]);
      if (!hasDescription) missing.push("Description");
    }

    if (mode !== "allWithoutImages") {
      // fields["Image URL"]/["Product Images"] reflect whatever column the
      // user actually mapped to those targets. An unmapped raw key (e.g. the
      // scraper's own "images" field) does NOT count as present here — it
      // never reaches buildFinalRow's output, so trusting it made this check
      // pass while the actual Airtable write ended up with no image at all.
      const hasImage =
        !isEmptyValue(fields["Image URL"]) ||
        !isEmptyValue(fields["Product Images"]) ||
        Boolean(manual["Image URL"]) ||
        Boolean(info?.images?.length);
      if (!hasImage) missing.push("Image URL");
    }

    return missing;
  }

  // Builds the Airtable-shaped row for one product, filling in whatever a
  // manually typed value (or a dragged-in image) supplied for fields the
  // JSON's own columns didn't carry.
  function buildImportRow(index: number): Record<string, unknown> {
    const fields = buildFinalRow(parsedRows[index]);
    const info = scrapedInfo[index];
    const manual = manualFieldValues[index] ?? {};

    if (isEmptyValue(fields.Price) && manual.Price) {
      fields.Price = manual.Price;
    }

    const descriptionPrefix = scrapedDescriptions[index] || (isEmptyValue(fields.Description) ? manual.Description : undefined);
    if (descriptionPrefix) {
      fields.Description = [descriptionPrefix, fields.Description].filter(Boolean).join("\n\n");
    }

    if (info?.images?.length) {
      // The row's gallery (dragged/pasted-in, or prefilled from the existing
      // Airtable record) always wins for "Product Images" — it was silently
      // ignored before whenever a mapped JSON column already had SOME value
      // for "Image URL", even a single-image one, so the multi-image gallery
      // never reached Airtable. The import route re-fetches each URL to
      // re-host it, but this way the thumbnails shown in the table are
      // exactly what gets imported.
      fields["Image URL"] = fields["Image URL"] ?? info.images[0];
      fields["Product Images"] = info.images.join(", ");
    } else if (isEmptyValue(fields["Image URL"]) && manual["Image URL"]) {
      fields["Image URL"] = manual["Image URL"];
    }

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

    // Before building the import payload, check whether Price, Description,
    // and Image URL all have a value from somewhere — mapped column, a
    // dragged-in image, or a manual entry. Anything still missing gets
    // flagged: open the page for a human to read it off of, and stop short
    // of importing until every flagged field is filled in by hand.
    const nextPendingFields: Record<number, MissingFieldKey[]> = {};
    for (const index of selectedIndexes) {
      const missing = detectMissingFields(index, scrapedInfo[index], manualFieldValues[index] ?? {});
      if (missing.length > 0) nextPendingFields[index] = missing;
    }

    // No longer blocks the import — a field with no source data (no mapped
    // column, or the mapped column is empty for this row) just gets written
    // to Airtable as empty. The admin still sees exactly which field(s) on
    // which product(s) were left blank, and the product pages still open so
    // they can fill them in afterward via "Verificare" if they want to.
    const pendingIndexes = Object.keys(nextPendingFields).map(Number);
    setPendingFields(nextPendingFields);
    let missingFieldsNote = "";
    if (pendingIndexes.length > 0) {
      for (const index of pendingIndexes) {
        const url = getProductUrl(parsedRows[index]);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
      }
      const details = pendingIndexes
        .map((index) => {
          const productName = getProductName(parsedRows[index]) || `rândul ${index + 1}`;
          const fieldLabels = nextPendingFields[index].map((field) => MISSING_FIELD_LABELS[field]).join(", ");
          return `${productName}: ${fieldLabels}`;
        })
        .join(" · ");
      missingFieldsNote = ` Câmpuri lăsate goale (fără coloană mapată sau rând gol) — ${details}.`;
    }

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
          : `${payload.imported} produse importate.`) + overwritePrompt + missingFieldsNote
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
              href="/store"
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
                <h2 className="text-xl font-medium text-[#301934]">Import produse din JSON</h2>
                <p className="mt-2 text-sm text-[#6b676b]">
                  Încarcă un fișier JSON (array de produse). Pentru fiecare coloană, alege sub numele ei
                  câmpul din Products căruia îi corespunde — coloanele lăsate pe &quot;— la Descriere —&quot;
                  (sau mapate la un câmp ales de mai multe coloane) se adaugă la Description, iar cele
                  puse pe &quot;— Ignoră —&quot; nu se importă deloc. Bifează produsele de importat și
                  alege categoria fiecăruia.
                </p>
                <input
                  type="file"
                  accept="application/json,.json"
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

                {parsedRows.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleSaveTemplate}
                      className="mt-4 inline-flex items-center rounded border border-[#d8d0c5] bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[#301934] hover:bg-[#f8f7f6]"
                    >
                      Salvează șablon (mapare coloane)
                    </button>
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
                                    {productUrlValue ? (
                                      <button
                                        type="button"
                                        onClick={() => openProductPage(productUrlValue)}
                                        className="inline-flex w-fit items-center rounded border border-[#d8d0c5] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#301934] hover:bg-[#f8f7f6]"
                                      >
                                        {getSiteLabel(productUrlValue)}
                                      </button>
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
                                {pendingFields[index]?.length ? (
                                  <div className="grid gap-1">
                                    {pendingFields[index].map((field) => (
                                      <input
                                        key={field}
                                        type={field === "Price" ? "number" : "text"}
                                        inputMode={field === "Price" ? "decimal" : undefined}
                                        placeholder={MISSING_FIELD_LABELS[field]}
                                        value={manualFieldValues[index]?.[field] ?? ""}
                                        onChange={(event) =>
                                          setManualFieldValues((current) => ({
                                            ...current,
                                            [index]: { ...current[index], [field]: event.target.value },
                                          }))
                                        }
                                        className="w-32 border border-[#d8d0c5] bg-white px-2 py-1 text-xs"
                                      />
                                    ))}
                                    {getProductUrl(row) && (
                                      <button
                                        type="button"
                                        onClick={() => openProductPage(getProductUrl(row))}
                                        className="inline-flex w-fit items-center rounded border border-[#d8d0c5] bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[#301934] hover:bg-[#f8f7f6]"
                                      >
                                        {getSiteLabel(getProductUrl(row))}
                                      </button>
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
