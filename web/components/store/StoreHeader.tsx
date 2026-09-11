"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";
import { departments } from "@/lib/products";
import { useCart } from "@/lib/cart-context";

export function StoreHeader() {
  const { count } = useCart();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    router.push(value ? `/store?search=${encodeURIComponent(value)}` : "/store");
    setSearchOpen(false);
  }

  return (
    <header className="store-header relative sticky top-0 z-50 backdrop-blur">
      <div className="border-b border-[#e6e3e5] bg-[#f8f7f6]">
        <div className="mx-auto flex max-w-6xl justify-end px-6 py-2 text-xs text-[#6b676b]">
          <div className="flex gap-5">
            <a
              href="/filiale"
              className="hover:text-[#301934]"
            >
              Filiale
            </a>
            <Link href="/livrare-si-plata" className="hover:text-[#301934]">
              Livrare și plată
            </Link>
          </div>
        </div>
      </div>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link
          href="/store"
          className="store-logo flex flex-col items-start gap-1"
        >
          <span
            className="inline-flex items-center gap-1.5 text-[9px] font-bold tracking-[0.22em] text-[#9a783f]"
            aria-label="Logo La Vive"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full border border-[#9a783f] text-[8px] tracking-normal">
              LV
            </span>
            <span>LA VIVE</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          {departments.map((department) => (
            <Link
              key={department.slug}
              href={`/store/d/${department.slug}`}
              className="store-nav-link transition-colors"
            >
              {department.name}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {searchOpen && (
            <form
              onSubmit={handleSearch}
              className="absolute right-6 top-full z-10 flex border border-[#e6e3e5] bg-white p-2 shadow-md sm:static sm:block sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
            >
              <label className="sr-only" htmlFor="store-search">
                Caută produse
              </label>
              <input
                id="store-search"
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Caută produse"
                className="h-10 w-48 border border-[#e6e3e5] bg-white px-3 text-sm text-[#242124] outline-none focus:border-[#301934]"
              />
            </form>
          )}
          <button
            type="button"
            onClick={() => setSearchOpen((open) => !open)}
            className="store-icon-button flex h-10 w-10 items-center justify-center text-[#301934] transition-colors"
            aria-label={searchOpen ? "Închide căutarea" : "Caută produse"}
            aria-expanded={searchOpen}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
            >
              <circle cx="11" cy="11" r="6.5" />
              <path strokeLinecap="round" d="m16 16 4.25 4.25" />
            </svg>
          </button>
          <Link
            href="/store/cart"
            className="store-icon-button relative flex h-10 w-10 items-center justify-center text-[#301934] transition-colors"
            aria-label="Coș"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              className="h-5 w-5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 3h1.386c.51 0 .955.343 1.087.836l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 1.98-4.694 2.57-7.166.075-.324-.174-.629-.507-.629H5.106M7.5 14.25L5.106 5.106M9.75 18.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm9 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
              />
            </svg>
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C9A227] px-1 text-[10px] font-bold text-white">
                {count}
              </span>
            )}
          </Link>

          <SignedOut>
            <div className="flex items-center gap-2">
              <SignInButton mode="modal">
                <button
                  type="button"
                  className="store-button store-button-secondary transition-colors"
                >
                  Autentificare
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button
                  type="button"
                  className="store-button store-button-primary transition-colors"
                >
                  Cont nou
                </button>
              </SignUpButton>
            </div>
          </SignedOut>
          <SignedIn>
            <UserButton afterSignOutUrl="/store" />
          </SignedIn>
        </div>
      </div>
    </header>
  );
}
