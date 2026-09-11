import Link from "next/link";

export const metadata = {
  title: "Filiale — LaVive",
  description: "Descoperă filialele LaVive.",
};

const branches = [
  { address: "Callatis 27", city: "Cluj" },
  { address: "Oașului 318A", city: "Cluj" },
];

export default function BranchesPage() {
  return (
    <main className="flex min-h-[calc(100vh-140px)] items-center justify-center bg-[#f8f7f6] px-6 py-12 text-[#242124] md:py-20">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/store"
          className="text-sm font-medium text-[#301934] hover:underline"
        >
          ← Înapoi la magazin
        </Link>

        <div className="mt-10 max-w-2xl">
          <div className="store-eyebrow">LaVive</div>
          <h1 className="mt-3 text-4xl font-medium leading-tight md:text-5xl">
            Filiale
          </h1>
          <p className="mt-5 text-base leading-relaxed text-[#6b676b]">
            Vizitează-ne în una dintre locațiile LaVive din Cluj.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {branches.map((branch) => (
            <address
              key={branch.address}
              className="not-italic border border-[#e6e3e5] bg-white p-7"
            >
              <h2 className="text-xl font-medium text-[#301934]">
                LaVive
              </h2>
              <p className="mt-4 text-base text-[#242124]">
                {branch.address}
              </p>
              <p className="mt-1 text-sm text-[#6b676b]">{branch.city}</p>
            </address>
          ))}
        </div>
      </div>
    </main>
  );
}
