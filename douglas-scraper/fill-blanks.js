// Fills blank price_old_ron / price_per_ml_ron cells in a products CSV by
// re-scraping each product_url's live PDP. Price data isn't in the PDP's
// __INITIAL_STATE__ or any XHR — it's rendered straight into the DOM
// (div.product-price, div.discounted-price__row), same situation as the
// image gallery in scrape.js, so this reads the DOM directly.
//
// Usage: node fill-blanks.js <path-to-csv>
//   node fill-blanks.js ../products/la-mer-products.csv

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function parseCsv(text) {
  const lines = text.trim().split('\n');
  const headers = lines[0].split(',');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cells = [];
    let cur = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const ch = line[j];
      if (inQuotes) {
        if (ch === '"' && line[j + 1] === '"') { cur += '"'; j++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === ',') { cells.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h, idx) => (row[h] = cells[idx] ?? ''));
    rows.push(row);
  }
  return { headers, rows };
}

function toCsv(headers, rows) {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(','));
  return lines.join('\n') + '\n';
}

// Romanian number format: '.' thousands separator, ',' decimal separator.
function parseRoNumber(s) {
  return parseFloat(s.replace(/\./g, '').replace(',', '.'));
}

function parseSizeMl(size) {
  const m = size.match(/([\d.,]+)\s*ml/i);
  return m ? parseRoNumber(m[1]) : null;
}

async function readPdpPrices(page, url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);
      const blocks = await page.evaluate(() =>
        Array.from(document.querySelectorAll('.discounted-price__row')).map((el) => el.textContent.trim())
      );
      for (const text of blocks) {
        const m = text.match(/PRP\s*([\d.,]+)\s*RON/);
        if (m) return { oldPrice: parseRoNumber(m[1]) };
      }
      return { oldPrice: null };
    } catch (err) {
      console.log(`    attempt ${attempt} failed (${err.message.split('\n')[0]})`);
      if (attempt === 3) return { oldPrice: null };
      await page.waitForTimeout(4000 * attempt);
    }
  }
  return { oldPrice: null };
}

async function main() {
  const csvPath = process.argv[2];
  if (!csvPath) {
    console.error('Usage: node fill-blanks.js <path-to-csv>');
    process.exit(1);
  }
  const fullPath = path.resolve(csvPath);
  const { headers, rows } = parseCsv(fs.readFileSync(fullPath, 'utf8'));

  const needsOldPrice = rows.filter((r) => !r.price_old_ron && r.product_url);
  const needsPerMl = rows.filter(
    (r) => !r.price_per_ml_ron && r.price_now_ron && parseSizeMl(r.size) !== null
  );

  console.log(`Blanks found: ${needsOldPrice.length} price_old_ron, ${needsPerMl.length} price_per_ml_ron`);

  for (const row of needsPerMl) {
    const ml = parseSizeMl(row.size);
    const price = parseRoNumber(row.price_now_ron);
    row.price_per_ml_ron = (price / ml).toFixed(2);
    console.log(`  computed price_per_ml_ron for "${row.name}" (${row.size}): ${row.price_per_ml_ron}`);
  }

  if (needsOldPrice.length) {
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ userAgent: UA });
    try {
      for (const row of needsOldPrice) {
        console.log(`  checking PDP for "${row.name}" (${row.size})...`);
        const { oldPrice } = await readPdpPrices(page, row.product_url);
        if (oldPrice) {
          row.price_old_ron = oldPrice.toFixed(2);
          console.log(`    -> price_old_ron = ${row.price_old_ron}`);
        } else {
          console.log('    -> no active discount on site, left blank');
        }
        await page.waitForTimeout(2000 + Math.floor(Math.random() * 1500));
      }
    } finally {
      await browser.close();
    }
  }

  fs.writeFileSync(fullPath, toCsv(headers, rows));
  console.log(`\nSaved: ${fullPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
