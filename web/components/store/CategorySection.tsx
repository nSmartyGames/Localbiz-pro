import type { Category, Product } from "@/lib/products";
import { HeroProduct } from "@/components/store/HeroProduct";
import { ProductCard } from "@/components/store/ProductCard";

export function CategorySection({
  category,
  catalog,
}: {
  category: Category;
  catalog: Product[];
}) {
  const categoryProducts = catalog.filter((product) => product.category === category.slug);
  const heroProduct =
    categoryProducts.find((product) => product.id === category.heroProductId) ?? categoryProducts[0];
  const rest = heroProduct
    ? categoryProducts.filter((product) => product.id !== heroProduct.id)
    : categoryProducts;

  return (
    <section id={category.slug} className="mt-[60px] scroll-mt-20">
      {heroProduct && <HeroProduct product={heroProduct} categoryName={category.name} />}

      <div className="w-full text-center">
        <div className="store-category-heading bg-[#301934] px-6 text-white">
          <h2 className="text-3xl font-medium uppercase tracking-wide text-white md:text-4xl">
            {category.name}
          </h2>
          {category.tagline && (
            <p className="mt-2 text-sm leading-relaxed text-white/85">
              {category.tagline}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto my-8 max-w-6xl px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rest.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
