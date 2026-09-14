import { NextResponse } from "next/server";
import { fillMissingProductFields } from "@/lib/import-product";

export const maxDuration = 30;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const productId = typeof body?.productId === "string" ? body.productId : "";
  if (!productId) {
    return NextResponse.json({ error: "productId lipsă." }, { status: 400 });
  }

  const updated = await fillMissingProductFields(productId).catch(() => null);
  return NextResponse.json({ updated });
}
