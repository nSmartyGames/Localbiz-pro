import Link from "next/link";
import Stripe from "stripe";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

type SessionSummary = {
  email: string | null;
  amountTotal: number | null;
  currency: string | null;
};

async function getSessionSummary(
  sessionId: string
): Promise<SessionSummary | null> {
  if (!stripe) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return {
      email: session.customer_details?.email ?? null,
      amountTotal: session.amount_total,
      currency: session.currency,
    };
  } catch (err) {
    console.error("Failed to retrieve checkout session:", err);
    return null;
  }
}

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  const summary = sessionId ? await getSessionSummary(sessionId) : null;

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
        <div
          style={{
            fontSize: "2.5rem",
            marginBottom: "1rem",
            color: "#C9A227",
          }}
        >
          ✓
        </div>
        <h1 style={{ fontSize: "1.75rem", marginBottom: "1rem" }}>
          Comanda ta a fost plasată cu succes!
        </h1>
        <p style={{ fontSize: "1rem", lineHeight: 1.6, marginBottom: "0.5rem" }}>
          Vei primi un email de confirmare
          {summary?.email ? ` la ${summary.email}` : ""}.
        </p>
        {summary?.amountTotal != null && summary.currency && (
          <p style={{ fontSize: "1rem", marginBottom: "1.5rem", opacity: 0.8 }}>
            Total plătit:{" "}
            {(summary.amountTotal / 100).toFixed(2)}{" "}
            {summary.currency.toUpperCase()}
          </p>
        )}
        <Link
          href="/store"
          style={{
            display: "inline-block",
            marginTop: "1.5rem",
            padding: "0.75rem 2rem",
            background: "#4B2354",
            color: "#f7f3ec",
            textDecoration: "none",
            borderRadius: "999px",
            letterSpacing: "0.05em",
            fontSize: "0.9rem",
          }}
        >
          Înapoi la magazin
        </Link>
      </div>
    </main>
  );
}
