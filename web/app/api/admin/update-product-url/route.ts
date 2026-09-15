import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { updateProductUrl } from "@/lib/import-product";

export const maxDuration = 30;

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const productId = typeof body?.productId === "string" ? body.productId : "";
  const productUrl = typeof body?.productUrl === "string" ? body.productUrl.trim() : "";
  if (!productId || !/^https?:\/\//i.test(productUrl)) {
    return NextResponse.json({ error: "productId și un productUrl valid sunt necesare." }, { status: 400 });
  }

  try {
    const { imageUrl, images } = await updateProductUrl(productId, productUrl);
    return NextResponse.json({ productUrl, imageUrl, images });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Eroare necunoscută." }, { status: 500 });
  }
}
