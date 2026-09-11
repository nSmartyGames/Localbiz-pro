import Link from "next/link";

export default function CancelPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f7f3ec",
        color: "#4B2354",
        padding: "2rem",
        textAlign: "center",
        fontFamily: "Georgia, serif",
      }}
    >
      <div style={{ maxWidth: 480 }}>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
          Plata a fost anulată
        </h1>
        <p style={{ fontSize: "1rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
          Coșul tău e încă salvat. Poți continua cumpărăturile sau relua plata
          oricând.
        </p>
        <div
          style={{
            display: "flex",
            gap: "1rem",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          <Link
            href="/store/cart"
            style={{
              display: "inline-block",
              padding: "0.75rem 2rem",
              background: "#4B2354",
              color: "#f7f3ec",
              textDecoration: "none",
              borderRadius: "999px",
              letterSpacing: "0.05em",
              fontSize: "0.9rem",
            }}
          >
            Vezi coșul
          </Link>
          <Link
            href="/store"
            style={{
              display: "inline-block",
              padding: "0.75rem 2rem",
              background: "transparent",
              color: "#4B2354",
              border: "1px solid #C9A227",
              textDecoration: "none",
              borderRadius: "999px",
              letterSpacing: "0.05em",
              fontSize: "0.9rem",
            }}
          >
            Continuă cumpărăturile
          </Link>
        </div>
      </div>
    </main>
  );
}
