/**
 * Locale configuration. Adding a third locale means:
 *   1. add its code to `locales`
 *   2. add a matching dictionary file + entry in `dictionaries.ts`
 *   3. add a font mapping in the layout
 * Nothing else in the app references locales by hand.
 */
export const locales = ["ar", "de"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ar";

/** Writing direction per locale. */
export const localeDirection: Record<Locale, "rtl" | "ltr"> = {
  ar: "rtl",
  de: "ltr",
};

/** BCP-47 tag used for Intl formatting. `ar-u-nu-latn` forces Latin digits. */
export const localeIntlTag: Record<Locale, string> = {
  ar: "ar-u-nu-latn",
  de: "de-DE",
};

/** Native label shown in the language switcher. */
export const localeLabel: Record<Locale, string> = {
  ar: "ع",
  de: "DE",
};

export const LOCALE_COOKIE = "easy_drive_locale";

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return localeDirection[locale];
}
