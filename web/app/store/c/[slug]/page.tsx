import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { categories, type CategorySlug } from "@/lib/products";
import { CategorySection } from "@/components/store/CategorySection";
import { getAllStoreProducts } from "@/lib/airtable-products";

function findCategory(slug: string) {
  return categories.find((c) => c.slug === (slug as CategorySlug));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = findCategory(slug);
  return { title: category ? `${category.name} | Magazin online` : "Magazin online" };
}

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = findCategory(slug);

  if (!category) {
    notFound();
  }

  const catalog = await getAllStoreProducts();

  return (
    <main>
      <CategorySection category={category} catalog={catalog} />
    </main>
  );
}
