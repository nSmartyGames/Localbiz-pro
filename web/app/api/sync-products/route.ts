import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin-auth";
import { getExistingProductIndex, getProductsSchema } from "@/lib/airtable-products";
import { DuplicateProductError, importProductRow } from "@/lib/import-product";

export const maxDuration = 60;

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }
  const [{ categories, fields }, existing] = await Promise.all([getProductsSchema(), getExistingProductIndex()]);
  return NextResponse.json({
    categories,
    fields,
    existingNames: Array.from(existing.byName.keys()),
    existingUrls: Array.from(existing.byUrl.keys()),
    existingDescriptionsByName: Object.fromEntries(existing.descriptionByName),
    existingDescriptionsByUrl: Object.fromEntries(existing.descriptionByUrl),
  });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const rows = Array.isArray(body?.rows) ? (body.rows as Record<string, unknown>[]) : [];

  if (rows.length === 0) {
    return NextResponse.json({ error: "Fișierul JSON nu conține produse." }, { status: 400 });
  }

  const imported: Array<{ name: string; airtableId: string }> = [];
  const errors: string[] = [];
  const duplicates: string[] = [];
  // Positions within THIS submitted `rows` array (not the full Sync table)
  // that were rejected as duplicates — the dashboard maps these back to its
  // own row indexes so a second Import click can force the overwrite.
  const duplicateIndexes: number[] = [];
  const touchedCategories = new Set<string>();
  const existing = await getExistingProductIndex();
  let overwritten = 0;

  for (const [index, row] of rows.entries()) {
    try {
      const result = await importProductRow(row, index, existing);
      imported.push(result);
      touchedCategories.add(result.category);
      if (result.overwritten) overwritten += 1;
      // Keep the in-flight index current so duplicates *within* this same
      // upload are also caught, not just ones already in Airtable.
      existing.byName.set(result.name.trim().toLowerCase(), result.airtableId);
    } catch (error) {
      if (error instanceof DuplicateProductError) {
        duplicates.push(error.message);
        duplicateIndexes.push(index);
      } else {
        errors.push(error instanceof Error ? error.message : `Rândul ${index + 1}: import eșuat.`);
      }
    }
  }

  for (const category of touchedCategories) {
    revalidatePath(`/store/d/${category}`);
  }

  return NextResponse.json({ ok: errors.length === 0, imported: imported.length, overwritten, errors, duplicates, duplicateIndexes });
}
