import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getAllStoreProducts } from "@/lib/airtable-products";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ error: "session_id lipsă" }, { status: 400 });
  }
  if (!stripe) {
    return NextResponse.json({ error: "Stripe neconfigurat" }, { status: 500 });
  }
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items.data.price.product"],
    });
    const lineItems = session.line_items?.data ?? [];
    const catalog = await getAllStoreProducts();
    const items = lineItems.map((li) => {
      const name = typeof li.price?.product === "object" && li.price.product !== null
        ? (li.price.product as Stripe.Product).name
        : li.description ?? "";
      const match =
        catalog.find((p) => p.name === name) ??
        catalog.find((p) => name.toLowerCase().includes(p.name.toLowerCase().slice(0, 20))) ??
        null;
      return {
        name,
        qty: li.quantity ?? 1,
        amountTotal: li.amount_total,
        currency: li.currency,
        product: match,
      };
    });
    return NextResponse.json({
      email: session.customer_details?.email ?? null,
      amountTotal: session.amount_total,
      currency: session.currency,
      items,
    });
  } catch (err) {
    console.error("order-items lookup failed:", err);
    return NextResponse.json({ error: "Sesiune invalidă" }, { status: 404 });
  }
}
