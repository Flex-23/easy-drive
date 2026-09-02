import { NextResponse, type NextRequest } from "next/server";
import { locales, defaultLocale, isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

/**
 * Redirects any un-prefixed path to a locale-prefixed one, choosing the stored
 * cookie locale, then the Accept-Language header, then the default (ar).
 * (In Next.js 16 the former `middleware` file is named `proxy`.)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const hasLocale = locales.some(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (hasLocale) return NextResponse.next();

  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const headerLocale = request.headers
    .get("accept-language")
    ?.split(",")[0]
    ?.split("-")[0];

  const locale =
    cookieLocale && isLocale(cookieLocale)
      ? cookieLocale
      : headerLocale && isLocale(headerLocale)
        ? headerLocale
        : defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, the API, and any file with an extension.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
