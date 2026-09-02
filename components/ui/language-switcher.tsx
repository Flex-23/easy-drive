"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { locales, localeLabel, LOCALE_COOKIE } from "@/lib/i18n/config";
import { useI18n } from "@/lib/i18n/context";
import { setBrowserCookie } from "@/lib/cookies";

export function LanguageSwitcher() {
  const { locale, dict } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function switchTo(next: string) {
    if (next === locale) return;
    setBrowserCookie(LOCALE_COOKIE, next);
    // Replace the leading /{locale} segment with the new locale.
    const rest = pathname.replace(/^\/[^/]+/, "");
    startTransition(() => {
      router.push(`/${next}${rest}`);
      router.refresh();
    });
  }

  return (
    <div
      className="inline-flex overflow-hidden rounded-[var(--radius-btn)] border border-border bg-surface"
      role="group"
      aria-label={dict.topbar.languageSwitch}
    >
      {locales.map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          disabled={pending}
          aria-pressed={l === locale}
          className={`press min-w-9 px-2.5 py-1.5 text-sm font-semibold tnum transition-colors ${
            l === locale
              ? "bg-accent text-accent-fg"
              : "text-text-muted hover:text-text"
          }`}
        >
          {localeLabel[l]}
        </button>
      ))}
    </div>
  );
}
