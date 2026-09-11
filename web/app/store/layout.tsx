import type { ReactNode } from "react";
import { CartProvider } from "@/lib/cart-context";
import { StoreHeader } from "@/components/store/StoreHeader";
import { StoreFooter } from "@/components/store/StoreFooter";
import { getAllStoreProducts } from "@/lib/airtable-products";

export default async function StoreLayout({ children }: { children: ReactNode }) {
  const catalog = await getAllStoreProducts();
  return (
    <CartProvider catalog={catalog}>
      <div className="store-shell">
        <StoreHeader />
        {children}
        <StoreFooter />
      </div>
    </CartProvider>
  );
}
