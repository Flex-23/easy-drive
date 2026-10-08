import type { Metadata } from "next";
import { Inter, IBM_Plex_Sans_Arabic } from "next/font/google";
import "../globals.css";
import { dir as dirFor, panelLocale } from "@/lib/i18n/config";

import { getDictionary } from "@/lib/i18n/dictionaries";
import { Providers } from "@/components/providers";
import { InlineScript } from "@/components/ui/inline-script";

/**
 * Root layout of the Master panel. `/panel` is its own document tree, entirely
 * outside the POS `/[locale]` routes — different URL, different session, no
 * shared navigation — and it is always Arabic, whatever the till is showing.
 */

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic-family",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Food Express — Master",
  robots: { index: false, follow: false },
};

const themeInit = `(function(){try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})();`;

export const dynamic = "force-dynamic";

export default function PanelRootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dict = getDictionary(panelLocale);

  return (
    <html
      lang={panelLocale}
      dir={dirFor(panelLocale)}
      data-theme="light"
      translate="no"
      suppressHydrationWarning
      className={`${inter.variable} ${plexArabic.variable}`}
    >
      <head>
        {/* The panel is Arabic by policy. A browser that auto-translates it
            rewrites the DOM before React hydrates, which breaks hydration. */}
        <meta name="google" content="notranslate" />
        <InlineScript html={themeInit} />
      </head>
      {/* Extensions commonly stamp attributes onto <body> before React loads. */}
      <body suppressHydrationWarning>
        <Providers locale={panelLocale} dict={dict}>
          <div className="flex h-dvh w-full flex-col overflow-hidden">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
