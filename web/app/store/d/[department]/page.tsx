import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDepartment, getCategoriesByDepartment } from "@/lib/products";
import { CategorySection } from "@/components/store/CategorySection";
import { getAllStoreProducts } from "@/lib/airtable-products";
import { FashionShoesSection } from "@/components/store/FashionShoesSection";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ department: string }>;
}): Promise<Metadata> {
  const { department: slug } = await params;
  const department = getDepartment(slug);
  return { title: department ? `${department.name} | Magazin online` : "Magazin online" };
}

export default async function DepartmentPage({
  params,
}: {
  params: Promise<{ department: string }>;
}) {
  const { department: slug } = await params;
  const department = getDepartment(slug);

  if (!department) {
    notFound();
  }

  const categories = getCategoriesByDepartment(department.slug);
  const catalog = await getAllStoreProducts();

  return (
    <main>
      <section className="store-hero">
        <div className="store-category-heading px-6 text-center">
          <div className="text-3xl font-medium uppercase tracking-wide text-[#301934] md:text-4xl">
            {department.name}
          </div>
        </div>
      </section>

      <div className="divide-y divide-[#e4ddd0]">
        {department.slug === "fashion" ? (
          <FashionShoesSection
            products={catalog.filter((product) => product.category === "fashion-men-shoes")}
          />
        ) : (
          categories.map((category) => (
            <CategorySection key={category.slug} category={category} catalog={catalog} />
          ))
        )}
      </div>
    </main>
  );
}
