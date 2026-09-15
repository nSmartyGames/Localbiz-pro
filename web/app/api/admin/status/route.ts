import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";

export async function GET() {
  const admin = await requireAdmin();
  return NextResponse.json({ isAdmin: Boolean(admin) });
}
