import Link from "next/link";

export const metadata = {
  title: "Livrare și plată — LaVive",
  description: "Informații despre livrare, plată și ridicarea comenzilor LaVive.",
};

export default function DeliveryAndPaymentPage() {
  return (
    <main className="flex min-h-[calc(100vh-140px)] items-center justify-center bg-[#f8f7f6] px-6 py-12 text-left text-[#242124] md:py-20">
      <div className="mx-auto w-full max-w-4xl">
        <Link
          href="/store"
          className="text-sm font-medium text-[#301934] hover:underline"
        >
          ← Înapoi la magazin
        </Link>
        <div className="mx-auto mt-10 max-w-2xl">
          <div className="store-eyebrow">LaVive</div>
          <h1 className="mt-3 text-4xl font-medium leading-tight md:text-5xl">
            Livrare și plată
          </h1>
          <p className="mt-5 text-base leading-relaxed text-[#6b676b]">
            Alege produsele preferate, iar noi ne ocupăm ca acestea să ajungă
            simplu și sigur la tine.
          </p>
        </div>

        <div className="mx-auto mt-12 grid gap-4 text-left md:grid-cols-2">
          <section className="border border-[#e6e3e5] bg-white p-7">
            <h2 className="text-xl font-medium text-[#301934]">Livrare</h2>
            <p className="mt-4 text-sm leading-relaxed text-[#6b676b]">
              Pentru informații despre livrare, disponibilitatea produselor și
              statusul comenzii, sună la:
            </p>
            <a
              href="tel:0771047048"
              className="mt-4 inline-block text-lg font-medium text-[#301934] hover:underline"
            >
              0771 047 048
            </a>
          </section>

          <section className="border border-[#e6e3e5] bg-white p-7">
            <h2 className="text-xl font-medium text-[#301934]">Plată</h2>
            <p className="mt-4 text-sm leading-relaxed text-[#6b676b]">
              Plata se finalizează în siguranță la checkout, prin metodele
              disponibile pentru comanda ta. Vei vedea opțiunile înainte de
              confirmarea plății.
            </p>
          </section>

          <section className="border border-[#e6e3e5] bg-white p-7">
            <h2 className="text-xl font-medium text-[#301934]">Ridicare din filială</h2>
            <p className="mt-4 text-sm leading-relaxed text-[#6b676b]">
              Pentru locații și informații despre filiale, consultă pagina
              dedicată LaVive.
            </p>
            <a
              href="/filiale"
              className="mt-4 inline-block text-sm font-medium text-[#301934] hover:underline"
            >
              Vezi filialele →
            </a>
          </section>

          <section className="border border-[#e6e3e5] bg-white p-7">
            <h2 className="text-xl font-medium text-[#301934]">Ai nevoie de ajutor?</h2>
            <p className="mt-4 text-sm leading-relaxed text-[#6b676b]">
              Echipa LaVive îți stă la dispoziție pentru întrebări despre
              produse, comenzi și livrare.
            </p>
            <a
              href="tel:0771047048"
              className="mt-4 inline-block text-sm font-medium text-[#301934] hover:underline"
            >
              Contactează-ne →
            </a>
          </section>
        </div>
      </div>
    </main>
  );
}
