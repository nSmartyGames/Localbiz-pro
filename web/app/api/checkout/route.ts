import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import Stripe from "stripe";
import { getAllStoreProducts } from "@/lib/airtable-products";

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

type CheckoutItem = { productId: string; qty: number };

export async function POST(req: Request) {
  if (!stripe) {
    console.error("STRIPE_SECRET_KEY is not set");
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 500 }
    );
  }

  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items?: CheckoutItem[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const items = Array.isArray(body.items) ? body.items : [];

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [];
  const storeProducts = await getAllStoreProducts();
  let checkoutCurrency: "ron" | "usd" | undefined;

  for (const item of items) {
    if (!item || typeof item.productId !== "string" || !(item.qty > 0)) {
      continue;
    }
    const product = storeProducts.find((entry) => entry.id === item.productId);
    if (!product || product.priceNow === null) {
      // Unknown product or out-of-stock (no price) — skip, can't be purchased.
      continue;
    }
    const currency = (product.currency ?? "RON").toLowerCase() as "ron" | "usd";
    if (checkoutCurrency && checkoutCurrency !== currency) {
      return NextResponse.json(
        { error: "Coșul nu poate conține produse în monede diferite." },
        { status: 400 }
      );
    }
    checkoutCurrency = currency;
    lineItems.push({
      price_data: {
        currency,
        product_data: {
          name: product.name,
          description: `${product.size}`,
        },
        unit_amount: Math.round(product.priceNow * 100),
      },
      quantity: item.qty,
    });
  }

  if (lineItems.length === 0) {
    return NextResponse.json(
      {
        error:
          "Coșul nu conține produse valide (disponibile) pentru plată.",
      },
      { status: 400 }
    );
  }

  const url = new URL(req.url);
  const origin =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    req.headers.get("origin") ||
    `${url.protocol}//${req.headers.get("host")}`;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      allow_promotion_codes: true,
      success_url: `${origin}${basePath}/store/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${basePath}/store/cancel`,
      client_reference_id: userId,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout session creation failed:", err);
    return NextResponse.json(
      { error: "A apărut o eroare la inițierea plății. Încearcă din nou." },
      { status: 500 }
    );
  }
}
