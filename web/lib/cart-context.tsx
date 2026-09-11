"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Product } from "@/lib/products";

export type CartItem = { productId: string; qty: number };

type CartContextValue = {
  items: CartItem[];
  addItem: (productId: string, qty?: number) => void;
  removeItem: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  count: number;
  subtotal: number;
  subtotalCurrency: Product["currency"] | null;
  getProduct: (productId: string) => Product | undefined;
};

const STORAGE_KEY = "la-mer-cart";

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({
  children,
  catalog = [],
}: {
  children: React.ReactNode;
  catalog?: Product[];
}) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from localStorage on mount (client only, avoids SSR mismatch).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // One-time hydration from localStorage on mount; state starts
          // empty on the server to avoid an SSR/client markup mismatch.
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setItems(parsed);
        }
      }
    } catch {
      // ignore malformed storage
    } finally {
      setHydrated(true);
    }
  }, []);

  // Persist to localStorage whenever items change (after initial hydration).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore write errors (e.g. storage full / private mode)
    }
  }, [items, hydrated]);

  const addItem = useCallback((productId: string, qty: number = 1) => {
    setItems((prev) => {
      const existing = prev.find((item) => item.productId === productId);
      if (existing) {
        return prev.map((item) =>
          item.productId === productId
            ? { ...item, qty: item.qty + qty }
            : item
        );
      }
      return [...prev, { productId, qty }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((item) => item.productId !== productId));
  }, []);

  const setQty = useCallback((productId: string, qty: number) => {
    setItems((prev) => {
      if (qty <= 0) {
        return prev.filter((item) => item.productId !== productId);
      }
      const existing = prev.find((item) => item.productId === productId);
      if (!existing) return prev;
      return prev.map((item) =>
        item.productId === productId ? { ...item, qty } : item
      );
    });
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const count = useMemo(
    () => items.reduce((sum, item) => sum + item.qty, 0),
    [items]
  );

  const subtotal = useMemo(
    () =>
      items.reduce((sum, item) => {
        const product = catalog.find((entry) => entry.id === item.productId);
        if (!product || product.priceNow === null) return sum;
        return sum + product.priceNow * item.qty;
      }, 0),
    [items, catalog]
  );

  const subtotalCurrency = useMemo(() => {
    const currencies = new Set(
      items
        .map((item) => catalog.find((product) => product.id === item.productId))
        .filter((product): product is Product => Boolean(product && product.priceNow !== null))
        .map((product) => product.currency ?? "RON")
    );
    return currencies.size === 1 ? [...currencies][0] : null;
  }, [items, catalog]);

  const getProduct = useCallback(
    (productId: string) => catalog.find((product) => product.id === productId),
    [catalog]
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      addItem,
      removeItem,
      setQty,
      clear,
      count,
      subtotal,
      subtotalCurrency,
      getProduct,
    }),
    [
      items,
      addItem,
      removeItem,
      setQty,
      clear,
      count,
      subtotal,
      subtotalCurrency,
      getProduct,
    ]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return ctx;
}
