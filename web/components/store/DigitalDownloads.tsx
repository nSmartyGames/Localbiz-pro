"use client";

import { useEffect, useState } from "react";
import type { Product } from "@/lib/products";
import { DIGITAL_DOWNLOAD_URL } from "@/lib/digital-products";

type OrderItem = {
  name: string;
  qty: number;
  product: Product | null;
};

export function DigitalDownloads({ sessionId }: { sessionId: string }) {
  const [items, setItems] = useState<OrderItem[] | null>(null);

  useEffect(() => {
    fetch(`/dpstore/api/order-items?session_id=${encodeURIComponent(sessionId)}`)
      .then((r) => r.json())
      .then((data) => setItems(Array.isArray(data.items) ? data.items : []))
      .catch(() => setItems([]));
  }, [sessionId]);

  if (items === null) {
    return <p style={{ fontSize: "0.95rem", opacity: 0.7 }}>Se încarcă fișierele digitale…</p>;
  }
  const digital = items.filter((i) => i.product && DIGITAL_DOWNLOAD_URL[i.product.id]);
  if (digital.length === 0) return null;

  return (
    <div style={{ marginTop: "2rem", textAlign: "left" }}>
      <h2 style={{ fontSize: "1.15rem", marginBottom: "0.35rem" }}>Fișierele tale digitale</h2>
      <p style={{ fontSize: "0.9rem", opacity: 0.75, marginBottom: "1rem", lineHeight: 1.5 }}>
        Trackerele cumpărate, gata de descărcat în format PDF.
      </p>
      <div style={{ display: "grid", gap: "0.75rem" }}>
        {digital.map(({ product }) =>
          product ? (
            <div
              key={product.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                background: "#fff",
                border: "1px solid #e4ddd0",
                borderRadius: 12,
                padding: "0.8rem 1rem",
              }}
            >
              <div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem" }}>{product.name}</div>
                <div style={{ fontSize: "0.8rem", opacity: 0.65 }}>{product.size}</div>
              </div>
              <a
                href={DIGITAL_DOWNLOAD_URL[product.id]}
                download
                style={{
                  background: "#2b1230",
                  color: "#f7f3ec",
                  borderRadius: 999,
                  padding: "0.65rem 1.4rem",
                  fontSize: "0.8rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                ⬇ Descarcă PDF
              </a>
            </div>
          ) : null
        )}
      </div>
    </div>
  );
}
