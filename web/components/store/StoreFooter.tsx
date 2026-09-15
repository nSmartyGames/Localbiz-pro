import Link from "next/link";

export function StoreFooter() {
  return (
    <footer className="border-t border-[#e6e3e5] bg-[#301934] text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-6 py-6 text-center text-sm">
        <span className="text-white/80">
          <span className="font-bold uppercase tracking-[0.16em] text-[#d4b477]">Locație:</span>{" "}
          Cluj, Strada Callatis
        </span>

        <a href="tel:0771047048" className="text-white/80 hover:text-white">
          <span className="font-bold uppercase tracking-[0.16em] text-[#d4b477]">Contact:</span>{" "}
          0771 047 048
        </a>

        <Link
          href="https://claude.ai"
          target="_blank"
          rel="noreferrer"
          className="text-white/80 hover:text-white"
        >
          <span className="font-bold uppercase tracking-[0.16em] text-[#d4b477]">Sponsori:</span>{" "}
          Claude AI
        </Link>
      </div>
    </footer>
  );
}
