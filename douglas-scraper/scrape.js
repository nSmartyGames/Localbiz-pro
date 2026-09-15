// Scrapes douglas.ro search results via SSR __INITIAL_STATE__ (no public product-search API exists;
// Akamai bot protection blocks the /api/v2/cms/pages endpoint outside a real browser, and the CMS
// endpoint doesn't carry product data anyway — products live in the Angular Universal transfer state
// embedded in the search page HTML).
//
// Usage: node scrape.js "<query>" [maxPages] [--gallery]
//   node scrape.js "parfum" 5
//   node scrape.js "parfum" 2 --gallery   (also visits each product page for its full image gallery)

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function extractInitialState(html) {
  const start = html.indexOf('window.__INITIAL_STATE__ = ');
  if (start === -1) throw new Error('__INITIAL_STATE__ not found in page HTML');
  const jsonStart = start + 'window.__INITIAL_STATE__ = '.length;

  // Walk brace depth to find the matching closing brace of the top-level object,
  // since the script tag concatenates several `window.X = {...};` statements.
  let depth = 0;
  let inString = false;
  let escape = false;
  let end = -1;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error('could not locate end of __INITIAL_STATE__ object');
  return JSON.parse(html.slice(jsonStart, end));
}

function normalizeProduct(p) {
  return {
    code: p.code,
    baseProduct: p.baseProduct,
    name: [p.baseProductName, p.name].filter(Boolean).join(' - '),
    brand: p.brand ? p.brand.name : null,
    url: p.url ? `https://www.douglas.ro${p.url.split('?')[0]}` : null,
    // full variant URL (with ?variant=) kept only to drive the gallery fetch; stripped before output
    _pdpUrl: p.url ? `https://www.douglas.ro${p.url}` : null,
    price: p.price ? p.price.value : null,
    currency: p.price ? p.price.currencyIso : null,
    formattedPrice: p.price ? p.price.formattedValue : null,
    stockStatus: p.stock ? p.stock.stockLevelStatus : null,
    availability: p.availability ? p.availability.code : null,
    rating: p.averageRating ?? null,
    numberOfReviews: p.numberOfReviews ?? null,
    images: p.images && p.images[0] ? [p.images[0].url] : [],
    description: p.description || null,
  };
}

// Gallery images aren't in any state blob or XHR response on the product detail page (PDP) —
// they're rendered straight into <img> tags client-side. Pull them from the live DOM instead.
async function fetchGallery(page, url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      const srcs = await page.evaluate(() =>
        Array.from(document.querySelectorAll('img'))
          .map((n) => n.src || n.getAttribute('data-src'))
          .filter((src) => src && src.includes('media.douglas.ro'))
      );

      const seen = new Set();
      const gallery = [];
      for (const src of srcs) {
        // imPolicy=grayScaled is just a render directive on the same asset (used while the
        // full-color copy is still loading) — strip it rather than dropping the image outright,
        // or products whose hero shot only appears grayscale-flagged in the DOM lose it entirely.
        const clean = src.replace(/[?&]imPolicy=grayScaled/, '');
        const key = clean.split('?')[0];
        if (seen.has(key)) continue;
        seen.add(key);
        gallery.push(clean);
      }
      return gallery;
    } catch (err) {
      console.log(`    gallery attempt ${attempt} failed (${err.message.split('\n')[0]})`);
      if (attempt === 3) return [];
      await page.waitForTimeout(4000 * attempt);
    }
  }
  return [];
}

async function scrapeQuery(query, maxPages = 1, withGallery = false) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ userAgent: UA });

  const allProducts = [];
  let totalPages = 1;

  try {
    for (let pageNum = 0; pageNum < maxPages; pageNum++) {
      const url = `https://www.douglas.ro/ro/search?q=${encodeURIComponent(query)}&page=${pageNum}`;
      console.log(`Fetching page ${pageNum}: ${url}`);

      let html;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(1500);
          html = await page.content();
          break;
        } catch (err) {
          console.log(`  attempt ${attempt} failed (${err.message.split('\n')[0]})`);
          if (attempt === 3) throw err;
          await page.waitForTimeout(4000 * attempt);
        }
      }

      const state = extractInitialState(html);
      const result = state.search && state.search.result;
      if (!result || !Array.isArray(result.products)) {
        console.log('No products found on this page, stopping.');
        break;
      }

      totalPages = result.pagination ? result.pagination.totalPages : 1;
      console.log(
        `  got ${result.products.length} products (page ${pageNum + 1}/${totalPages}, ${result.pagination.totalResults} total results)`
      );

      allProducts.push(...result.products.map(normalizeProduct));

      if (pageNum + 1 >= totalPages) break;

      // polite delay between pages to avoid tripping Akamai's rate limiting
      await page.waitForTimeout(2500 + Math.floor(Math.random() * 1500));
    }

    if (withGallery) {
      // dedupe by PDP url — variants of the same base product often share one PDP
      const uniqueUrls = [...new Set(allProducts.map((p) => p._pdpUrl).filter(Boolean))];
      const galleries = new Map();

      console.log(`\nFetching galleries for ${uniqueUrls.length} product pages...`);
      for (let i = 0; i < uniqueUrls.length; i++) {
        const url = uniqueUrls[i];
        console.log(`  [${i + 1}/${uniqueUrls.length}] ${url}`);
        galleries.set(url, await fetchGallery(page, url));
        await page.waitForTimeout(2000 + Math.floor(Math.random() * 1500));
      }

      for (const p of allProducts) {
        const gallery = galleries.get(p._pdpUrl);
        if (gallery && gallery.length) p.images = gallery;
      }
    }

    for (const p of allProducts) delete p._pdpUrl;
  } finally {
    await browser.close();
  }

  return allProducts;
}

function toCsv(products) {
  if (products.length === 0) return '';
  const headers = Object.keys(products[0]);
  const escape = (v) => {
    if (v === null || v === undefined) return '';
    const s = (Array.isArray(v) ? v.join('|') : String(v)).replace(/"/g, '""');
    return /[",\n|]/.test(s) ? `"${s}"` : s;
  };
  const lines = [headers.join(',')];
  for (const p of products) lines.push(headers.map((h) => escape(p[h])).join(','));
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const withGallery = args.includes('--gallery');
  const positional = args.filter((a) => a !== '--gallery');
  const query = positional[0];
  const maxPages = parseInt(positional[1] || '1', 10);

  if (!query) {
    console.error('Usage: node scrape.js "<query>" [maxPages] [--gallery]');
    process.exit(1);
  }

  const products = await scrapeQuery(query, maxPages, withGallery);
  console.log(`\nTotal products scraped: ${products.length}`);

  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });
  const base = query.replace(/[^a-z0-9]+/gi, '-').toLowerCase();

  fs.writeFileSync(path.join(outDir, `${base}.json`), JSON.stringify(products, null, 2));
  fs.writeFileSync(path.join(outDir, `${base}.csv`), toCsv(products));

  console.log(`Saved to output/${base}.json and output/${base}.csv`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
