import Link from "next/link";

export function StoreFooter() {
  return (
    <footer className="border-t border-[#e6e3e5] bg-[#301934] text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 sm:grid-cols-3">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#d4b477]">
            Locație
          </h2>
          <address className="mt-3 not-italic text-sm leading-relaxed text-white/80">
            Cluj
            <br />
            Strada Callatis
          </address>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#d4b477]">
            Contact
          </h2>
          <a
            href="tel:0771047048"
            className="mt-3 inline-block text-sm text-white/80 hover:text-white"
          >
            0771 047 048
          </a>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-[#d4b477]">
            Sponsori
          </h2>
          <Link
            href="https://claude.ai"
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block text-sm text-white/80 hover:text-white"
          >
            Claude AI
          </Link>
        </div>
      </div>
    </footer>
  );
}
