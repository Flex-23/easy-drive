import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";
import { isLocale, dir as dirFor, locales, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { Providers } from "@/components/providers";
import { InlineScript } from "@/components/ui/inline-script";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Easy Drive",
  description: "Easy Drive — bilingual restaurant point-of-sale terminal.",
};

// Runs before paint so the correct theme is applied with no flash of light/dark.
const themeInit = `(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})();`;

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

// The POS is backed by a live database — always render per request.
export const dynamic = "force-dynamic";

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);

  // Only the document shell lives here; the till itself (rail, top bar and the
  // cashier guard) is the `(pos)` layout, so the sign-in page can render bare.
  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      data-theme="light"
      translate="no"
      suppressHydrationWarning
      className={`${inter.variable} ${plexArabic.variable}`}
    >
      <head>
        {/* The till is German by policy. A browser that auto-translates it
            rewrites the DOM before React hydrates, which breaks hydration. */}
        <meta name="google" content="notranslate" />
        <InlineScript html={themeInit} />
      </head>
      {/* Extensions commonly stamp attributes onto <body> before React loads. */}
      <body suppressHydrationWarning>
        <Providers locale={locale} dict={dict}>
          <div className="flex h-dvh w-full overflow-hidden">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
