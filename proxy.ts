import { NextResponse, type NextRequest } from "next/server";
import { locales, posLocale } from "@/lib/i18n/config";
import { PANEL_COOKIE } from "@/lib/auth/cookies";

/**
 * Routes the two areas of the app and keeps each in its own language: the till
 * is always German (`/de/…`), the Master panel is its own tree at `/panel`.
 *
 * The till has no sign-in: anyone with the link walks straight in, so this only
 * normalises the locale. The Master panel keeps its gate — an unauthenticated
 * visit there is sent to its sign-in before any page renders.
 * (In Next.js 16 the former `middleware` file is named `proxy`.)
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // The Master panel lives outside the localised POS tree — never rewrite it.
  if (pathname === "/panel" || pathname.startsWith("/panel/")) {
    if (pathname !== "/panel/login" && !request.cookies.has(PANEL_COOKIE)) {
      return NextResponse.redirect(new URL("/panel/login", request.url));
    }
    return NextResponse.next();
  }

  const localePrefix = locales.find(
    (l) => pathname === `/${l}` || pathname.startsWith(`/${l}/`),
  );
  if (localePrefix && localePrefix !== posLocale) {
    // The till is German-only; an old Arabic link lands on its German twin.
    const url = request.nextUrl.clone();
    url.pathname = pathname.replace(`/${localePrefix}`, `/${posLocale}`);
    return NextResponse.redirect(url);
  }
  if (localePrefix) {
    // Login is disabled on the till: no cookie check, the page opens. Every
    // order is still attributed to a real cashier by requireCashier().
    return NextResponse.next();
  }

  // Everything else is the till, which serves customers in German.
  const url = request.nextUrl.clone();
  url.pathname = `/${posLocale}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Skip Next internals, the API, and any file with an extension.
  matcher: ["/((?!_next|api|.*\\..*).*)"],
};
