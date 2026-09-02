import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";
import { isLocale, dir as dirFor, locales, type Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { getSettings } from "@/lib/queries/settings";
import { getCurrentCashier } from "@/lib/session";
import { checkDbHealth } from "@/lib/queries/health";
import { Providers } from "@/components/providers";
import { IconRail } from "@/components/pos/icon-rail";
import { TopBar } from "@/components/pos/top-bar";
import { InlineScript } from "@/components/ui/inline-script";
import pkg from "@/package.json";

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

const TERMINAL_ID = "TERM-01";

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
  const [settings, cashier, dbHealthy] = await Promise.all([
    getSettings(),
    getCurrentCashier(),
    checkDbHealth(),
  ]);

  return (
    <html
      lang={locale}
      dir={dirFor(locale)}
      data-theme="light"
      suppressHydrationWarning
      className={`${inter.variable} ${plexArabic.variable}`}
    >
      <head>
        <InlineScript html={themeInit} />
      </head>
      <body>
        <Providers locale={locale} dict={dict}>
          <div className="flex h-dvh w-full overflow-hidden">
            <IconRail />
            <div className="flex min-w-0 flex-1 flex-col">
              <TopBar
                restaurantName={settings.restaurantName}
                cashierName={cashier?.name ?? null}
                dbHealthy={dbHealthy}
                version={pkg.version}
                terminalId={TERMINAL_ID}
              />
              <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
