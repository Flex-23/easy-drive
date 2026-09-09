import { NextResponse, type NextRequest } from "next/server";
import { locales, posLocale } from "@/lib/i18n/config";
import { POS_COOKIE, PANEL_COOKIE } from "@/lib/auth/cookies";

/**
 * Routes the two areas of the app and keeps each in its own language: the till
 * is always German (`/de/…`), the Master panel is its own tree at `/panel`.
 * It also turns an unauthenticated visit into a plain redirect to the right
 * sign-in, before any page starts rendering.
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
    // No cashier cookie, no till. The page guards verify the cookie for real;
    // this only spares an unauthenticated visitor a half-rendered screen.
    const loginPath = `/${localePrefix}/login`;
    if (pathname !== loginPath && !request.cookies.has(POS_COOKIE)) {
      return NextResponse.redirect(new URL(loginPath, request.url));
    }
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
