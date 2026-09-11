import type { Product } from "@/lib/products";
import { ProductCard } from "@/components/store/ProductCard";

export function FashionShoesSection({ products }: { products: Product[] }) {
  return (
    <section className="border-t border-[#e4ddd0]">
      <div className="w-full text-center">
        <div className="bg-[#4B2354] px-6 py-[45px]">
          <p className="text-sm font-semibold uppercase tracking-[0.35em] text-[#C9A227]">
            Bărbați
          </p>
          <h2 className="mt-2 text-2xl font-semibold uppercase tracking-wide text-white">
            Încălțăminte
          </h2>
        </div>
        <div className="bg-[#341739] px-6 py-[45px]">
          <p className="text-[15px] uppercase leading-relaxed text-[#f7f3ec]">
            Performance, heritage și stil pentru fiecare pas.
          </p>
        </div>
      </div>

      <div className="mx-[20px] my-[20px]">
        <div className="grid grid-cols-1 gap-0 sm:grid-cols-2 lg:grid-cols-4">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </div>
    </section>
  );
}
