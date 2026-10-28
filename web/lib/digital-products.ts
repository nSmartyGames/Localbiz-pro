import type { Product } from "@/lib/products";

// Static digital products sold as downloads after payment. They are not in
// Airtable — getAllStoreProducts() appends them so cart, checkout, category
// pages and the success page all see one merged catalog.
// First-page thumbnails rendered from each PDF (see
// public/digital/first-10kg-tracker/*-cover.png).
const PREVIEW_TEAL = "/digital/first-10kg-tracker/variant-A-calm-teal-cover.png";
const PREVIEW_NAVY = "/digital/first-10kg-tracker/variant-B-warm-navy-cover.png";

export const DIGITAL_DOWNLOAD_URL: Record<string, string> = {
  "tracker-primii-10kg-calm-teal": "/dpstore/digital/first-10kg-tracker/variant-A-calm-teal.pdf",
  "tracker-primii-10kg-warm-navy": "/dpstore/digital/first-10kg-tracker/variant-B-warm-navy.pdf",
};

export function getDigitalProducts(): Product[] {
  return [
    {
      id: "tracker-primii-10kg-calm-teal",
      name: "Tracker vizual «Primii 10 kg» — Calm Teal",
      category: "slabire-trackere",
      size: "PDF · 5 pagini",
      priceNow: 19,
      priceOld: 29,
      pricePerMl: null,
      currency: "RON",
      description:
        "Tracker vizual de slăbire «Primii 10 kg» (5 pagini): diagramă de colorat în kg și lbs, scară de recompense, măsurători și pagini înainte/după — PDF nedatat, imprimabil și pentru tabletă.",
      imageUrl: PREVIEW_TEAL,
      images: [PREVIEW_TEAL],
      isReal: true,
      productUrl: null,
    },
    {
      id: "tracker-primii-10kg-warm-navy",
      name: "Tracker vizual «Primii 10 kg» — Warm Navy",
      category: "slabire-trackere",
      size: "PDF · 5 pagini",
      priceNow: 19,
      priceOld: 29,
      pricePerMl: null,
      currency: "RON",
      description:
        "Tracker vizual de slăbire «Primii 10 kg» (5 pagini): diagramă de colorat în kg și lbs, scară de recompense, măsurători și pagini înainte/după — PDF nedatat, imprimabil și pentru tabletă.",
      imageUrl: PREVIEW_NAVY,
      images: [PREVIEW_NAVY],
      isReal: true,
      productUrl: null,
    },
  ];
}
