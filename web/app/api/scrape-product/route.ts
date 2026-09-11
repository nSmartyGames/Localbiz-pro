import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { scrapeProductPage } from "@/lib/import-product";

export const maxDuration = 30;

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const url = typeof body?.url === "string" ? body.url : "";
  if (!/^https?:\/\//i.test(url)) {
    return NextResponse.json({ error: "URL invalid." }, { status: 400 });
  }

  const result = await scrapeProductPage(url);
  return NextResponse.json(result);
}
