import Link from "next/link";
import { getAllStoreProducts } from "@/lib/airtable-products";
import { ProductCard } from "@/components/store/ProductCard";

const DEPLOY_BASE_PATH = "/dpstore";

const CARD_STYLES: Record<string, string> = {
  beauty: "bg-[#4B2354] text-[#f7f3ec]",
  health: "bg-[#3D1F4A] text-[#f7f3ec]",
  house: "bg-[#5C3358] text-[#f7f3ec]",
  garden: "bg-[#2E1A38] text-[#f7f3ec]",
  fashion: "bg-[#24142d] text-[#f7f3ec]",
  outdoor: "bg-[#3E5148] text-[#f7f3ec]",
};

const HOME_CATEGORIES = [
  {
    slug: "beauty",
    name: "Produse de înfrumusețare",
    subtitle: "Creme, uleiuri, farduri, bijuterii",
    href: "/store/d/beauty",
    image: `${DEPLOY_BASE_PATH}/category-backgrounds/beauty.jpg`,
  },
  {
    slug: "health",
    name: "Sănătate",
    subtitle: "Vitamine, suplimente, îngrijire, wellness",
    href: "/store/d/health",
    image: `${DEPLOY_BASE_PATH}/category-backgrounds/health.jpg`,
  },
  {
    slug: "garden",
    name: "Grădină",
    subtitle: "Plante, unelte, semințe, ghiveci",
    href: "/store/d/garden",
    image: `${DEPLOY_BASE_PATH}/category-backgrounds/garden.jpg`,
  },
  {
    slug: "outdoor",
    name: "Outdoor fit",
    subtitle: "Echipament, fitness, camping, aventură",
    href: "/store/d/fashion",
    image: `${DEPLOY_BASE_PATH}/category-backgrounds/outdoor.jpg`,
  },
  {
    slug: "house",
    name: "Case mici și corturi",
    subtitle: "Case, corturi, mobilier, accesorii",
    href: "/store/d/house",
    image: `${DEPLOY_BASE_PATH}/category-backgrounds/house.jpg`,
  },
  {
    slug: "fashion",
    name: "Modă bărbați / femei",
    subtitle: "Îmbrăcăminte, încălțăminte, accesorii, bijuterii",
    href: "/store/d/fashion",
    image: `${DEPLOY_BASE_PATH}/category-backgrounds/fashion.jpg`,
  },
] as const;

export default async function StoreHomePage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const { search } = await searchParams;
  const searchTerm = search?.trim() ?? "";
  const searchResults = searchTerm
    ? (await getAllStoreProducts()).filter((product) =>
        `${product.name} ${product.description} ${product.category}`
          .toLocaleLowerCase("ro-RO")
          .includes(searchTerm.toLocaleLowerCase("ro-RO"))
      )
    : [];

  return (
    <main>
      <section className="store-hero text-[#242124]">
        <div className="mx-auto grid max-w-6xl grid-cols-1 divide-y divide-[#e6e3e5] md:grid-cols-3 md:divide-x md:divide-y-0">
          <div className="px-6 py-8 text-center">
            <div className="store-eyebrow">Livrare</div>
            <p className="mt-2 text-sm text-[#6b676b]">Comenzi și informații</p>
            <a
              href="tel:0771047048"
              className="mt-2 inline-block text-base font-medium text-[#301934] hover:underline"
            >
              0771 047 048
            </a>
          </div>
          <div className="px-6 py-8 text-center">
            <div className="store-eyebrow">Filiale</div>
            <p className="mt-2 text-sm text-[#6b676b]">Găsește LaVive aproape de tine</p>
            <a
              href="/filiale"
              className="mt-2 inline-block text-sm font-medium text-[#301934] hover:underline"
            >
              Vezi filialele
            </a>
          </div>
          <div className="px-6 py-8 text-center">
            <div className="store-eyebrow">Livrare și plată</div>
            <p className="mt-2 text-sm text-[#6b676b]">Opțiuni de transport și plată</p>
            <Link
              href="/livrare-si-plata"
              className="mt-2 inline-block text-sm font-medium text-[#301934] hover:underline"
            >
              Află detalii
            </Link>
          </div>
        </div>
      </section>

      {searchTerm && (
        <section className="mx-auto max-w-6xl px-6 pb-12 pt-10">
          <h2 className="text-2xl font-medium text-[#301934]">
            Rezultate pentru „{searchTerm}”
          </h2>
          {searchResults.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {searchResults.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[#6b676b]">
              Nu am găsit produse pentru această căutare.
            </p>
          )}
        </section>
      )}

      <div className="mx-auto grid max-w-6xl grid-cols-1 px-6 pb-20 sm:grid-cols-2 lg:grid-cols-3">
        {HOME_CATEGORIES.map((category) => (
          <Link
            key={category.slug}
            href={category.href}
            className={`group relative flex aspect-square items-center justify-center overflow-hidden p-8 text-center transition-[filter] hover:brightness-110 ${CARD_STYLES[category.slug] ?? "bg-[#4B2354] text-[#f7f3ec]"}`}
          >
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
              style={{ backgroundImage: `url("${category.image}")` }}
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-[#211124]/55 transition-colors group-hover:bg-[#211124]/45"
            />
            <div className="relative max-w-[16rem] text-white">
              <h2 className="text-2xl font-semibold uppercase leading-tight tracking-wide md:text-3xl">
                {category.name}
              </h2>
              {"subtitle" in category && (
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-white/90">
                  {category.subtitle}
                </p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
