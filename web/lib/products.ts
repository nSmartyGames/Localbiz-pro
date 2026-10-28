export type DepartmentSlug = "beauty" | "health" | "house" | "garden" | "fashion";

export type Department = {
  slug: DepartmentSlug;
  name: string; // display name, e.g. "Beauty"
  tagline: string;
};

export const departments: Department[] = [
  { slug: "beauty", name: "Frumusețe", tagline: "" },
  { slug: "health", name: "Sănătate", tagline: "Sănătate susținută zilnic, din surse de încredere." },
  { slug: "house", name: "Case mici și corturi", tagline: "Spații alese cu grijă pentru un stil de viață liber." },
  { slug: "garden", name: "Grădină", tagline: "Tot ce ai nevoie pentru un spațiu verde reușit." },
  { slug: "fashion", name: "Modă bărbați / femei", tagline: "Piese statement pentru fiecare pas." },
];

export type CategorySlug =
  | "crema-de-fata"
  | "crema-de-noapte"
  | "uleiuri-tratamente"
  | "seturi-ingrijire"
  | "suplimente-vitamine"
  | "slabire-trackere"
  | "casa-decor"
  | "gradina-exterior"
  | "fashion-men-shoes";

export type Product = {
  id: string; // kebab-case, unique, stable (used in URLs /store/p/[id])
  name: string;
  category: CategorySlug;
  size: string; // e.g. "60 ml" or "1 buc"
  priceNow: number | null; // RON, null = "Preț la cerere" (out of stock/no price)
  currency?: "RON" | "USD";
  priceOld: number | null; // RON, null if no discount
  pricePerMl: number | null; // RON per ml, null if not applicable (sets)
  description: string; // one sentence, Romanian
  imageUrl: string | null; // photo URL (placeholder-backed), null falls back to initials
  images?: string[]; // optional extra gallery photos shown on the product detail page
  isReal: boolean; // true = real Douglas SKU, false = fictional demo SKU
  productUrl: string | null; // real douglas.ro URL, or null for demo products
};

export type Category = {
  slug: CategorySlug;
  department: DepartmentSlug;
  name: string; // Romanian display name
  tagline: string; // one short marketing line, Romanian
  heroProductId: string; // id of the Product that is the hero/featured one for this category
};

export const categories: Category[] = [
  {
    slug: "crema-de-fata",
    department: "beauty",
    name: "Crema de față",
    tagline: "Hidratare legendară, pentru un ten radiant în fiecare zi.",
    heroProductId: "creme-de-la-mer-moisturizing-250ml",
  },
  {
    slug: "crema-de-noapte",
    department: "beauty",
    name: "Cremă de noapte",
    tagline: "Regenerare profundă în timpul somnului, cu puterea Miracle Broth™.",
    heroProductId: "rejuvenating-night-cream-60ml",
  },
  {
    slug: "uleiuri-tratamente",
    department: "beauty",
    name: "Uleiuri & tratamente",
    tagline: "Concentrate prețioase pentru un ten revitalizat și luminos.",
    heroProductId: "renewal-oil-30ml",
  },
  {
    slug: "seturi-ingrijire",
    department: "beauty",
    name: "Seturi & îngrijire completă",
    tagline: "Ritualuri complete, gata de dăruit sau de răsfățat.",
    heroProductId: "nighttime-ritual-gift-set",
  },
  {
    slug: "suplimente-vitamine",
    department: "health",
    name: "Suplimente & vitamine",
    tagline: "Sănătate susținută zilnic, din surse de încredere.",
    heroProductId: "ph-balance-probiotic-30cps",
  },
  {
    slug: "slabire-trackere",
    department: "health",
    name: "Slăbire & trackere",
    tagline: "Tracker vizual «Primii 10 kg» — PDF imprimabil și pentru tabletă.",
    heroProductId: "tracker-primii-10kg-calm-teal",
  },
  {
    slug: "casa-decor",
    department: "house",
    name: "Casă & decor",
    tagline: "Obiecte alese cu grijă pentru un cămin frumos.",
    heroProductId: "ceramic-vase-set",
  },
  {
    slug: "gradina-exterior",
    department: "garden",
    name: "Grădină & exterior",
    tagline: "Tot ce ai nevoie pentru un spațiu verde reușit.",
    heroProductId: "potting-soil-mix-20l",
  },
];


export function getDepartments(): Department[] {
  return departments;
}

export function getDepartment(slug: string): Department | undefined {
  return departments.find((d) => d.slug === (slug as DepartmentSlug));
}

export function getCategoriesByDepartment(slug: DepartmentSlug): Category[] {
  return categories.filter((c) => c.department === slug);
}
