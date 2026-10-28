// Local-only HTTP bridge in front of a single long-lived Playwright browser,
// so the Sync page's "Scrapează produs" button (running in the browser, on
// whatever machine the admin opened the dashboard on) can reach a real
// Chrome and get past a site's bot check — plain fetch/curl gets blocked
// outright on some sites regardless of headers:
//   - douglas.ro: a deceptive Akamai 400 "Request Too Long".
//   - notino.ro: a Cloudflare "managed challenge" (the "Just a moment..."
//     interstitial) — a harder check than Douglas's, since it actively
//     fingerprints the browser (navigator.webdriver, JS execution) rather
//     than just headers, and can still reject an automated browser outright.
//   - olx.ro: a CloudFront 403 "Request blocked" on any non-browser fetch.
// This server is NOT meant to be deployed; run it on your own machine next
// to the browser you're using the dashboard from.
//
// Usage: node server.js
//   POST http://localhost:5391/scrape  { "url": "https://www.douglas.ro/ro/p/..." }
//   POST http://localhost:5391/scrape  { "url": "https://www.notino.ro/..." }
//   POST http://localhost:5391/scrape  { "url": "https://www.olx.ro/d/oferta/..." }

const http = require('http');
const { chromium } = require('playwright');

const PORT = process.env.DOUGLAS_BRIDGE_PORT || 5391;
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

// Hosts this bridge is willing to visit, and what it takes to get past each
// one's bot check. Reject anything else outright rather than letting an
// arbitrary URL through a real logged-in-capable browser.
//   - olx.ro: a CloudFront 403 on plain fetch, same as Douglas's Akamai
//     check, but its schema.org Product/Offer JSON-LD already carries name,
//     description, images and price -- no OLX-specific DOM scraping needed,
//     just a real browser to get past the block.
const ALLOWED_HOST_PATTERN = /(^|\.)(douglas\.ro|notino\.ro|olx\.ro)$/i;

let browserPromise = null;
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      channel: 'chrome',
      headless: true,
      // Cloudflare's managed challenge (notino.ro) actively fingerprints
      // the browser rather than just checking headers (unlike Douglas's
      // Akamai check) — this flag plus the navigator.webdriver override
      // below are the standard, non-exotic mitigations; there's no
      // guarantee a given site's challenge still lets an automated browser
      // through.
      args: ['--disable-blink-features=AutomationControlled'],
    });
    const launched = browserPromise;
    launched.then((browser) => {
      // Chrome can die between requests (crash, OOM, manual kill) — drop the
      // cached handle so the next scrape launches a fresh browser instead of
      // failing on a dead one with "Target page, context or browser has been
      // closed".
      browser.on('disconnected', () => {
        if (browserPromise === launched) browserPromise = null;
      });
    });
  }
  return browserPromise;
}

function isChallengePage(title, html) {
  return /just a moment/i.test(title || '') || /cf-chl|cf_chl|challenges\.cloudflare\.com/i.test(html || '');
}

// Same field extraction as scrape.js's fetchGallery (images) and
// fill-blanks.js's readPdpPrices (old price) and import-product.ts's
// data-testid="product-information" (description), combined into one PDP
// visit since we're already paying for a real page load. JSON-LD is tried
// first since it's the same shape across most storefronts (schema.org
// Product/Offer) — the Douglas-specific CSS selectors only kick in for
// whatever JSON-LD doesn't carry on that particular site (its PDP has no
// price in JSON-LD, only in the rendered markup).
async function scrapePdp(url) {
  let browser = await getBrowser();
  if (!browser.isConnected()) {
    browserPromise = null;
    browser = await getBrowser();
  }
  const page = await browser.newPage({ userAgent: UA, locale: 'ro-RO' });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  try {
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

        // A Cloudflare managed challenge often clears itself (redirecting to
        // the real page) within a few seconds once the browser's fingerprint
        // passes — worth waiting out before giving up, since re-navigating
        // (the retry loop below) just restarts the same challenge.
        for (let waited = 0; waited < 12000; waited += 1000) {
          const title = await page.title().catch(() => '');
          if (!isChallengePage(title, '')) break;
          await page.waitForTimeout(1000);
        }

        await page.waitForTimeout(1500);

        const title = await page.title().catch(() => '');
        const html = await page.content().catch(() => '');
        if (isChallengePage(title, html)) {
          throw new Error('Pagina e blocată de o verificare anti-bot (Cloudflare/Akamai) și browserul nu a putut trece de ea.');
        }

        return await page.evaluate(() => {
          const jsonLd = { name: null, description: null, priceNow: null, priceOld: null, images: [] };
          for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
            try {
              const data = JSON.parse(script.textContent);
              for (const item of Array.isArray(data) ? data : [data]) {
                if (item['@type'] !== 'Product') continue;
                if (!jsonLd.name && typeof item.name === 'string' && item.name.trim()) jsonLd.name = item.name.trim();
                if (!jsonLd.description && typeof item.description === 'string' && item.description.trim()) {
                  jsonLd.description = item.description.trim();
                }
                const rawImage = item.image;
                const images = Array.isArray(rawImage) ? rawImage : rawImage ? [rawImage] : [];
                for (const image of images) {
                  // Some Notino PDPs default a missing product photo's JSON-LD
                  // "image" to the page's own canonical URL instead of omitting
                  // it — reject that rather than importing the product page
                  // link as if it were a photo.
                  if (typeof image === 'string' && image !== location.href) jsonLd.images.push(image);
                }
                const offers = Array.isArray(item.offers) ? item.offers : item.offers ? [item.offers] : [];
                for (const offer of offers) {
                  const price = Number(offer.price ?? offer.lowPrice);
                  if (jsonLd.priceNow === null && Number.isFinite(price)) jsonLd.priceNow = price;
                  const highPrice = Number(offer.highPrice);
                  if (jsonLd.priceOld === null && Number.isFinite(highPrice)) jsonLd.priceOld = highPrice;
                }
              }
            } catch {
              continue;
            }
          }

          const description = jsonLd.description;
          let name = jsonLd.name || document.querySelector('h1')?.textContent?.trim() || null;
          let priceNow = jsonLd.priceNow;
          let priceOld = jsonLd.priceOld;
          let images = jsonLd.images;
          let size = null;

          const isDouglas = location.hostname.includes('douglas.ro');
          if (isDouglas) {
            // JSON-LD's Product.name on Douglas is actually the size/variant
            // label (e.g. "250 ml"), not the product title -- and for some
            // variants it's outright broken, rendering literally "<size> -
            // null". The h1 (#header-product-content) isn't right either --
            // it wraps brand + name + category breadcrumb noise together.
            // The clean product name alone lives in the nested
            // [data-testid="header-product-name"] span.
            name =
              document.querySelector('[data-testid="header-product-name"]')?.textContent?.trim() ||
              document.querySelector('h1')?.textContent?.trim() ||
              name;

            // Each size swatch (15ml/30ml/60ml/...) renders its own price
            // under the same `.product-price`/`.discounted-price__row`
            // classes as the currently selected variant, so grabbing the
            // first DOM match picks a sibling swatch's price instead of the
            // one actually shown for the `?variant=` in the URL. Scope to
            // the checked size-variant radio instead, and within it prefer
            // the discounted price and the "lowest price in the last 30
            // days" figure the -X% badge is based on -- the PRP figure next
            // to it is just the manufacturer's suggested price, not a real
            // "was" price, so it's ignored even when present.
            const checkedVariant = document.querySelector('input[name="sizeVariants"][aria-checked="true"]');
            const priceScope = checkedVariant ? checkedVariant.closest('label') : document.body;

            const current =
              priceScope?.querySelector('[data-testid="price-discount"]') ||
              priceScope?.querySelector('[data-testid="price-type-current"]');
            if (current) {
              const m = current.textContent.match(/([\d.,]+)\s*RON/);
              if (m) priceNow = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
            }

            const lowest30 = priceScope?.querySelector('[data-testid="price-type-lowest-strikethrough"]');
            if (lowest30) {
              const m = lowest30.textContent.match(/([\d.,]+)\s*RON/);
              if (m) priceOld = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
            } else {
              priceOld = null;
            }

            const sizeMatch = (priceScope?.textContent || '').match(/([\d.,]+)\s*ml/i);
            if (sizeMatch) size = `${sizeMatch[1]} ml`;
            // The PDP gallery is a Swiper carousel that lazy-loads every slide but
            // the first: non-visible <img>s carry their real URL in data-lazy-src
            // (not data-src) and only get it copied into src once Swiper decides to
            // activate that slide, which may never happen in a headless, unscrolled
            // page. Read data-lazy-src directly instead of waiting on that. JSON-LD
            // only ever lists the single hero photo, so always run this scan for
            // Douglas rather than gating it on images.length === 0 — otherwise the
            // rest of the gallery is silently dropped whenever JSON-LD has one.
            // Restrict to the "<id><productCode>-<index>-global.<ext>" filename
            // shape real gallery photos use, so payment/social/logo icons served
            // from the same media.douglas.ro host don't get swept in too.
            const seen = new Set();
            const galleryImages = [];
            for (const img of document.querySelectorAll('img')) {
              const src = img.getAttribute('data-lazy-src') || img.src || img.getAttribute('data-src');
              if (!src || !src.includes('media.douglas.ro')) continue;
              if (!/-\d+-global\.(jpe?g|png|webp)(\?|$)/i.test(src)) continue;
              const clean = src.replace(/[?&]imPolicy=grayScaled/, '');
              const key = clean.split('?')[0];
              if (seen.has(key)) continue;
              seen.add(key);
              galleryImages.push(clean);
            }
            if (galleryImages.length > 0) images = galleryImages;
          }

          const isNotino = location.hostname.includes('notino.ro');
          if (isNotino) {
            // JSON-LD's Offer price on Notino is fixed to whichever variant
            // the page considers canonical (often the default/largest size),
            // not the one actually selected/shown -- e.g. still 100ml's price
            // when the page displays 50ml. The selected size lives in
            // #pdSelectedVariant, but the price element's own markup shifts
            // between products (sometimes nested inside that div, sometimes
            // a sibling elsewhere on the page) -- the one part that's stable
            // across both is a [data-testid="pd-price-wrapper"] element
            // somewhere on the page, containing a price span and a currency
            // span each carrying their value in a `content` attribute rather
            // than plain text. Pick the numeric one over the currency one
            // ("RON") by filtering for digits.
            const priceWrapper = document.querySelector('[data-testid="pd-price-wrapper"]');
            const priceEl = priceWrapper
              ? Array.from(priceWrapper.querySelectorAll('[content]')).find((el) =>
                  /^[\d.,]+$/.test(el.getAttribute('content') || '')
                )
              : null;
            if (priceEl) {
              const raw = priceEl.getAttribute('content');
              const price = parseFloat(String(raw).replace(/\./g, '').replace(',', '.'));
              if (Number.isFinite(price)) priceNow = price;
            }

            // The variant's size (e.g. "100 ml") lives as plain text inside
            // #pdSelectedVariant, alongside unrelated badges (e.g. a
            // "Promoție" discount tag) -- pull just the "<number> ml" part
            // out of its full text rather than trusting any single child.
            const selectedVariant = document.querySelector('#pdSelectedVariant');
            const sizeMatch = selectedVariant?.textContent.match(/([\d.,]+)\s*ml/i);
            if (sizeMatch) size = `${sizeMatch[1]} ml`;

            // JSON-LD's own "image" list on Notino points at its "order_2k"
            // path, which despite the name is a tiny ~140x140 thumbnail —
            // not usable as a product photo. The real gallery images (the
            // one in id="pd-image-main" plus the rest, unlabeled, alongside
            // it) live under a "detail_main_<quality>" path instead;
            // swapping that quality segment for "hq" gets the largest size
            // Notino serves (~400x1000, vs. mq's ~320x800).
            const seen = new Set();
            const hqImages = [];
            for (const img of document.querySelectorAll('img')) {
              const src = img.src || img.getAttribute('data-src') || '';
              const match = src.match(/^(https?:\/\/cdn\.notinoimg\.com\/)detail_main_[a-z0-9]+\/(.+)$/i);
              if (!match) continue;
              const hq = `${match[1]}detail_main_hq/${match[2]}`;
              if (seen.has(hq)) continue;
              seen.add(hq);
              hqImages.push(hq);
            }
            if (hqImages.length > 0) images = hqImages;
          }

          if (images.length === 0) {
            // Same self-referential-default risk as JSON-LD's "image" above —
            // an og:image content stuck on the page's own URL is not a photo.
            const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
            if (ogImage && ogImage !== location.href) images = [ogImage];
          }

          return {
            name,
            description,
            priceNow,
            priceOld,
            size,
            images: Array.from(new Set(images))
              .map((src) => (src.startsWith('//') ? `https:${src}` : src))
              .filter((src) => src !== location.href),
          };
        });
      } catch (err) {
        lastError = err;
        await page.waitForTimeout(4000 * attempt);
      }
    }
    throw lastError;
  } finally {
    await page.close();
  }
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/scrape') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found. POST /scrape with { "url": "..." }' }));
    return;
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', async () => {
    let url;
    try {
      url = JSON.parse(body || '{}').url;
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
      return;
    }

    let hostname;
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = '';
    }
    if (typeof url !== 'string' || !/^https:\/\//i.test(url) || !ALLOWED_HOST_PATTERN.test(hostname)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'url must be a douglas.ro, notino.ro, or olx.ro product page.' }));
      return;
    }

    try {
      const result = await scrapePdp(url);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message || 'Scrape failed.' }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`Local scrape bridge listening on http://localhost:${PORT}`);
  console.log('Leave this running, then use the "Scrapează produs" button on the Sync dashboard page.');
});

async function shutdown() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
