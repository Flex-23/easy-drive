import { NextResponse } from "next/server";
import { getMenu } from "@/lib/queries/menu";
import { isLocale, defaultLocale } from "@/lib/i18n/config";

/** GET /api/menu?locale=ar|de — the active menu for an external channel. */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get("locale") ?? defaultLocale;
  const locale = isLocale(raw) ? raw : defaultLocale;
  const menu = await getMenu(locale);
  return NextResponse.json({ locale, categories: menu });
}
