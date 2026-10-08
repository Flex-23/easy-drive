/**
 * Locale configuration. Adding a third locale means:
 *   1. add its code to `locales`
 *   2. add a matching dictionary file + entry in `dictionaries.ts`
 *   3. add a font mapping in the layout
 * Nothing else in the app references locales by hand.
 */
export const locales = ["ar", "de"] as const;

export type Locale = (typeof locales)[number];

/**
 * The language of each area is fixed, not chosen by whoever is standing at the
 * machine: the till and everything around it serve customers in **German**,
 * while the Master panel is the owner's own screen and is **Arabic**.
 */
export const defaultLocale: Locale = "de";

/** The POS runs in this language; there is no switcher on that side. */
export const posLocale: Locale = "de";

/** The Master panel runs in this language, whatever the POS is doing. */
export const panelLocale: Locale = "ar";

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

export function isLocale(value: string): value is Locale {
  return (locales as readonly string[]).includes(value);
}

export function dir(locale: Locale): "rtl" | "ltr" {
  return localeDirection[locale];
}
